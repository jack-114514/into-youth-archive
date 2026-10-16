"""Package-lock recovery and readable diagnostics, with no real package installation."""
import contextlib
import io
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import time
import unittest
from unittest.mock import Mock, patch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / 'scripts'))
import install_apt
import install_log
import install_ui


class PackageWaitTests(unittest.TestCase):
    def test_busy_task_is_waited_for_then_continues(self):
        busy = Mock(side_effect=[True, False])
        with patch.object(install_apt.time, 'sleep') as sleep, contextlib.redirect_stdout(io.StringIO()) as output:
            self.assertTrue(install_apt.wait_for_packages(time.monotonic() + 10, busy=busy))
        self.assertEqual(busy.call_count, 2)
        sleep.assert_called_once()
        self.assertIn('系统软件任务正在运行', output.getvalue())

    def test_timeout_never_runs_or_interrupts_another_installer(self):
        with patch.object(install_apt, 'wait_for_packages', return_value=False), patch.object(install_apt.subprocess, 'Popen') as launch:
            self.assertEqual(install_apt.run(['unused-command']), 1)
            launch.assert_not_called()
        with contextlib.redirect_stdout(io.StringIO()):
            self.assertFalse(install_apt.wait_for_packages(time.monotonic() - 1, busy=lambda: True))

    @unittest.skipUnless(os.name == 'posix', 'Debian advisory lock test requires POSIX')
    def test_real_advisory_lock_owner_is_preserved_and_release_is_detected(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'package.lock'
            path.write_text('keep this content', encoding='utf-8')
            command = [sys.executable, '-c', "import fcntl,sys; f=open(sys.argv[1],'r+'); fcntl.lockf(f,fcntl.LOCK_EX); print('ready',flush=True); sys.stdin.readline()", str(path)]
            process = subprocess.Popen(command, stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True)
            try:
                self.assertEqual(process.stdout.readline().strip(), 'ready')
                with patch.object(install_apt, 'LOCKS', (str(path),)):
                    self.assertTrue(install_apt.package_manager_busy())
                    self.assertIsNone(process.poll())
                    process.stdin.write('\n'); process.stdin.flush(); process.wait(timeout=5)
                    self.assertFalse(install_apt.package_manager_busy())
                self.assertEqual(path.read_text(encoding='utf-8'), 'keep this content')
            finally:
                if process.poll() is None:
                    process.terminate(); process.wait(timeout=5)
                process.stdin.close(); process.stdout.close()

    def test_lock_race_retries_and_apt_receives_wait_config(self):
        seen = []
        def launch(command, **kwargs):
            config = Path(kwargs['env']['APT_CONFIG']).read_text(encoding='utf-8')
            seen.append(config)
            process = Mock()
            process.stdout = io.StringIO('E: Could not get lock /var/lib/dpkg/lock-frontend\n' if len(seen) == 1 else 'installed\n')
            process.wait.return_value = 100 if len(seen) == 1 else 0
            return process
        with patch.object(install_apt, 'wait_for_packages', return_value=True), \
             patch.object(install_apt.subprocess, 'Popen', side_effect=launch), \
             patch.object(install_apt.time, 'sleep'), contextlib.redirect_stdout(io.StringIO()) as output:
            self.assertEqual(install_apt.run(['sh', 'installer']), 0)
        self.assertEqual(len(seen), 2)
        self.assertIn('DPkg::Lock::Timeout', seen[0])
        self.assertIn('Acquire::Retries "3"', seen[0])
        self.assertIn('不会删除锁文件', output.getvalue())

    def test_network_failure_is_not_retried_as_a_package_lock(self):
        process = Mock(stdout=io.StringIO('curl: Could not resolve host\n'))
        process.wait.return_value = 6
        with patch.object(install_apt, 'wait_for_packages', return_value=True), patch.object(install_apt.subprocess, 'Popen', return_value=process) as launch, contextlib.redirect_stdout(io.StringIO()):
            self.assertEqual(install_apt.run(['sh', 'installer']), 6)
        launch.assert_called_once()


class InstallerLogTests(unittest.TestCase):
    def test_lock_error_has_specific_chinese_reason_and_simple_log_command(self):
        with tempfile.TemporaryDirectory() as directory, contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()) as errors:
            code = install_ui.run('Docker', [sys.executable, '-c', 'print("E: Could not get lock /var/lib/dpkg/lock-frontend"); raise SystemExit(100)'], Path(directory), interval=.05)
        self.assertEqual(code, 100)
        self.assertIn('占用了安装锁', errors.getvalue())
        self.assertIn('python3 scripts/install_log.py', errors.getvalue())
        self.assertNotIn('下载失败时检查网络', errors.getvalue())

    def test_waiting_status_is_not_misreported_as_downloading(self):
        state = install_ui.describe('系统软件任务正在运行，正在等待安装锁释放', '[5/8] 安装容器工具（Docker）')
        self.assertIn('等待完成后自动继续', state)
        self.assertNotIn('下载', state)

    def test_log_pointer_and_old_installation_fallback_find_real_files(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory); temporary = root / 'tmp'; temporary.mkdir()
            folder = temporary / 'memory-archive-install.actual'; folder.mkdir()
            earlier = folder / '123.log'; earlier.write_text('old error', encoding='utf-8')
            newer = folder / '456.log'; newer.write_text('new error', encoding='utf-8')
            os.utime(earlier, (1, 1)); os.utime(newer, (2, 2))
            (temporary / 'memory-archive-install.sh').write_text('not a directory', encoding='utf-8')
            self.assertEqual(install_log.latest_log(root, temporary), newer)
            (root / '.install-last-log').write_text(str(earlier), encoding='utf-8')
            self.assertEqual(install_log.latest_log(root, temporary), earlier)

    def test_runner_records_the_exact_log_path(self):
        with tempfile.TemporaryDirectory() as directory, contextlib.redirect_stdout(io.StringIO()):
            root = Path(directory); pointer = root / '.install-last-log'
            self.assertEqual(install_ui.run('test', [sys.executable, '-c', 'print("ok")'], root / 'logs', log_pointer=pointer), 0)
            log = Path(pointer.read_text(encoding='utf-8').strip())
            self.assertTrue(log.is_file())
            self.assertIn('ok', log.read_text(encoding='utf-8'))


if __name__ == '__main__':
    unittest.main()
