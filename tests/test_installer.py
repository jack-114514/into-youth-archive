"""Check novice defaults, advanced configuration, localization and failed builds."""
import contextlib
import io
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / 'scripts'))
import configure
import install_memory
import install_ui
import show_login


class InstallerConfigurationTests(unittest.TestCase):
    def configure(self, answers, passwords=('',), old=None, lang='zh', extra_env=None, non_interactive=False):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            if old:
                configure.write_env(root / '.env', old)
            prompts = []
            answers, passwords = iter(answers), iter(passwords)
            def ask(prompt):
                prompts.append(prompt)
                return next(answers)
            def private(prompt):
                prompts.append(prompt)
                return next(passwords)
            argv = ['configure.py'] + (['--edit'] if old else []) + (['--non-interactive'] if non_interactive else [])
            with patch.object(configure, 'ROOT', root), patch.object(sys, 'argv', argv), \
                 patch.dict(os.environ, {'INSTALL_LANG': lang, **(extra_env or {})}, clear=True), \
                 patch('builtins.input', side_effect=ask), patch('getpass.getpass', side_effect=private), \
                 contextlib.redirect_stdout(io.StringIO()) as output:
                configure.main()
            result = configure.read_env(root / '.env')
            backups = list(root.glob('backups/*/config.env'))
            return result, prompts, output.getvalue(), [configure.read_env(p) for p in backups]

    def test_enter_defaults_only_ask_domain_email_password_and_mode(self):
        values, prompts, output, _ = self.configure(['photos.example.org', 'owner@example.org', ''])
        self.assertEqual(len(prompts), 4)
        self.assertEqual(values['ADMIN_USERNAME'], 'owner@example.org')
        self.assertGreaterEqual(len(values['ADMIN_PASSWORD']), 12)
        self.assertGreaterEqual(len(values['PASSWORD_CODE_PEPPER']), 32)
        self.assertEqual(values['SMTP_HOST'], '')
        self.assertEqual(values['TURNSTILE_SITE_KEY'], '')
        self.assertNotIn('SMTP', ''.join(prompts))
        self.assertNotIn(values['ADMIN_PASSWORD'], output)
        self.assertIn('邮箱找回密码暂未启用', output)

    def test_invalid_required_inputs_retry_in_place(self):
        values, prompts, _, _ = self.configure(['https://wrong.example.org', 'photos.example.org', 'bad-email', 'owner@example.org', ''], ['short', ''])
        self.assertEqual(len(prompts), 7)
        self.assertEqual(values['DOMAIN'], 'photos.example.org')

    def test_advanced_skips_services_on_enter(self):
        values, prompts, _, _ = self.configure(['photos.example.org', 'owner@example.org', '2', '', '', ''])
        self.assertEqual(values['ADMIN_USERNAME'], 'owner@example.org')
        self.assertEqual(values['SMTP_HOST'], '')
        self.assertEqual(len(prompts), 7)

    def test_advanced_rejects_email_as_mail_hostname(self):
        values, _, _, _ = self.configure([
            'photos.example.org', 'owner@example.org', '2', '',
            'y', 'public-test-key', 'y', 'owner@example.org', 'smtp.example.org', '', '', 'owner@example.org', '',
        ], ['', 'private-test-key', 'mail-test-authorization'])
        self.assertEqual(values['SMTP_HOST'], 'smtp.example.org')
        self.assertEqual(values['SMTP_PORT'], '465')
        self.assertEqual(values['SMTP_FROM'], 'owner@example.org')
        self.assertEqual(values['TURNSTILE_SECRET_KEY'], 'private-test-key')

    def test_basic_reconfigure_preserves_secrets_and_backs_up(self):
        old, _, _, _ = self.configure(['photos.example.org', 'owner@example.org', '2', '',
                                      'y', 'public-test-key', 'y', 'smtp.example.org', '', '', 'owner@example.org', ''],
                                     ['', 'private-test-key', 'mail-test-authorization'])
        new, _, _, backups = self.configure(['', '', ''], old=old)
        self.assertEqual(new, old)
        self.assertEqual(backups, [old])

    def test_english_prompts_and_noninteractive_compatibility(self):
        values, prompts, output, _ = self.configure(['photos.example.org', 'owner@example.org', ''], lang='en')
        self.assertIn('Website domain', prompts[0])
        self.assertNotRegex(''.join(prompts) + output, r'[\u4e00-\u9fff]')
        saved, prompts, _, _ = self.configure([], non_interactive=True, extra_env={
            'DOMAIN': 'photos.example.org', 'ACME_EMAIL': 'owner@example.org', 'HTTP_PORT': '18080',
            'SMTP_HOST': 'smtp.example.org', 'SMTP_USERNAME': 'owner@example.org',
            'SMTP_PASSWORD': 'mail-test-authorization', 'SMTP_FROM': 'owner@example.org',
        })
        self.assertEqual(prompts, [])
        self.assertEqual(saved['HTTP_PORT'], '18080')
        self.assertEqual(saved['SMTP_HOST'], 'smtp.example.org')


class ProgressAndMemoryTests(unittest.TestCase):
    def test_progress_is_operation_specific_and_bilingual(self):
        with patch.dict(os.environ, {'INSTALL_LANG': 'zh'}):
            text = install_ui.describe('Receiving objects:  45% (45/100)')
            self.assertIn('[#########-----------] 45%', text)
            self.assertIn('当前镜像层下载', install_ui.describe('12.5MB / 25.0MB'))
            self.assertIn('50%', install_ui.describe('12.5MB / 25.0MB'))
            self.assertNotIn('%', install_ui.describe('no total known'))
        with patch.dict(os.environ, {'INSTALL_LANG': 'en'}):
            self.assertIn('Compiling website', install_ui.describe('RUN npm run build'))

    def test_real_process_failure_is_not_reported_as_success_and_log_is_private(self):
        with tempfile.TemporaryDirectory() as directory, contextlib.redirect_stdout(io.StringIO()) as output, \
             contextlib.redirect_stderr(io.StringIO()) as errors:
            status = install_ui.run('Build', [sys.executable, '-c', 'print("Killed"); raise SystemExit(137)'], Path(directory), interval=.05)
            self.assertNotEqual(status, 0)
            self.assertNotIn('完成', output.getvalue())
            self.assertIn('内存不足', errors.getvalue())
            logs = list(Path(directory).glob('*.log'))
            self.assertEqual(len(logs), 1)
            if os.name != 'nt': self.assertEqual(logs[0].stat().st_mode & 0o777, 0o600)

    def test_silent_long_step_has_heartbeat_and_completes(self):
        with tempfile.TemporaryDirectory() as directory, contextlib.redirect_stdout(io.StringIO()) as output:
            status = install_ui.run('Download', [sys.executable, '-c', 'import time; time.sleep(.15)'], Path(directory), interval=.05)
            self.assertEqual(status, 0)
            self.assertIn('已用', output.getvalue())
            self.assertIn('完成', output.getvalue())

    def test_small_server_gets_swap_budget_but_sufficient_server_needs_no_change(self):
        self.assertEqual(install_memory.swap_size({'MemAvailable': 400, 'SwapFree': 0}), 3072)
        self.assertEqual(install_memory.swap_size({'MemAvailable': 3500, 'SwapFree': 0}), 0)
        self.assertEqual(install_memory.swap_size({'MemAvailable': 500, 'SwapFree': 3072}), 0)

    def test_rejecting_swap_never_executes_system_commands(self):
        with patch.object(install_memory, 'cgroup_limit', return_value=None), \
             patch.object(install_memory, 'read_memory', return_value={'MemTotal': 913, 'MemAvailable': 400, 'SwapFree': 0}), \
             patch.dict(os.environ, {'INSTALL_NON_INTERACTIVE': ''}), patch('builtins.input', return_value='n'), \
             patch('subprocess.run') as execute, contextlib.redirect_stdout(io.StringIO()):
            with self.assertRaises(SystemExit): install_memory.main()
            execute.assert_not_called()

    def test_no_terminal_never_leaks_password_to_output(self):
        with patch.object(show_login, 'read_env', return_value={'DOMAIN': 'photos.example.org', 'ADMIN_USERNAME': 'owner@example.org', 'ADMIN_PASSWORD': 'hidden-fixture-password'}), \
             patch.object(Path, 'open', side_effect=OSError('no tty')), contextlib.redirect_stdout(io.StringIO()) as output:
            show_login.main()
            self.assertNotIn('hidden-fixture-password', output.getvalue())


if __name__ == '__main__':
    unittest.main()
