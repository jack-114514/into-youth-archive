import gc
import hashlib
import io
import json
import os
import tempfile
import threading
import time
import unittest
from pathlib import Path
from unittest.mock import patch
from urllib.error import HTTPError
from urllib.request import Request, urlopen
from http.server import ThreadingHTTPServer
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from server import app, admin_app_api, login_security, mobile_turnstile


class LoginSecurityTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory()
        app.DATA_DIR = Path(cls.tmp.name)
        app.UPLOAD_DIR = app.DATA_DIR / 'uploads'
        app.DB_PATH = app.DATA_DIR / 'site.db'
        admin_app_api.DB_PATH = app.DB_PATH
        cls.env = patch.dict(os.environ, {
            'ADMIN_USERNAME': 'admin@example.test', 'ADMIN_PASSWORD': 'test-only-password-123',
            'TURNSTILE_SITE_KEY': 'public-test-key', 'TURNSTILE_SECRET_KEY': 'test-secret',
            'TURNSTILE_ALLOWED_HOSTNAMES': 'example.test',
        })
        cls.env.start()
        app.initialize()
        cls.http = ThreadingHTTPServer(('127.0.0.1', 0), app.Handler)
        cls.thread = threading.Thread(target=cls.http.serve_forever, daemon=True)
        cls.thread.start()
        cls.base = f'http://127.0.0.1:{cls.http.server_port}'

    @classmethod
    def tearDownClass(cls):
        cls.http.shutdown()
        cls.http.server_close()
        cls.env.stop()
        gc.collect()
        cls.tmp.cleanup()

    def setUp(self):
        with app.db() as connection:
            login_security._ensure_table(connection)
            connection.execute('DELETE FROM admin_login_guard')
            connection.execute('DELETE FROM sessions')
            connection.execute('DELETE FROM admin_app_sessions')
        login_security._attempts.clear()
        admin_app_api._RATE_BUCKETS.clear()

    def request(self, path, data=None, headers=None):
        req = Request(self.base + path, data=json.dumps(data).encode() if data is not None else None,
                      headers={'Content-Type': 'application/json', **(headers or {})})
        try:
            response = urlopen(req)
        except HTTPError as error:
            response = error
        with response:
            body = response.read().decode()
            return response.status, json.loads(body) if 'application/json' in response.headers.get('Content-Type', '') else body

    def credentials(self, password='test-only-password-123', token=None):
        return {'username': 'admin@example.test', 'password': password, 'turnstile_token': token}




    def test_mobile_always_requires_captcha_before_password_check(self):
        with patch.object(admin_app_api, '_password_hash', side_effect=AssertionError('password bypass')):
            self.assertEqual(self.request('/api/v1/admin-app/auth/login', self.credentials())[0], 403)
        with patch.object(mobile_turnstile, 'verify', return_value=True):
            self.assertEqual(self.request('/api/v1/admin-app/auth/login', self.credentials(token='valid'))[0], 200)

    def test_verification_outage_fails_closed(self):
        with patch.object(mobile_turnstile, 'verify', side_effect=OSError()):
            self.assertEqual(self.request('/api/v1/admin-app/auth/login', self.credentials(token='valid'))[0], 502)
        with patch.dict(os.environ, {'TURNSTILE_SECRET_KEY': ''}):
            self.assertEqual(self.request('/api/v1/admin-app/auth/login', self.credentials())[0], 503)


    def test_spoofed_forwarded_headers_cannot_reset_mobile_limit(self):
        for index in range(10):
            self.request('/api/v1/admin-app/auth/login', self.credentials(), {'CF-Connecting-IP': str(index), 'X-Forwarded-For': str(index)})
        self.assertEqual(self.request('/api/v1/admin-app/auth/login', self.credentials(), {'CF-Connecting-IP': 'new'})[0], 429)

    def test_page_does_not_expose_secret(self):
        status, page = self.request('/api/v1/admin-app/auth/challenge')
        self.assertEqual(status, 200)
        self.assertIn('public-test-key', page)
        self.assertNotIn('test-secret', page)
        self.assertIn('admin_app_login', page)

    def test_server_checks_action_hostname_success_and_replay(self):
        for result, expected in [
            ({'success': True, 'action': 'admin_app_login', 'hostname': 'example.test'}, True),
            ({'success': True, 'action': 'admin_password_recovery', 'hostname': 'example.test'}, False),
            ({'success': True, 'action': 'admin_app_login', 'hostname': 'evil.test'}, False),
            ({'success': False, 'error-codes': ['timeout-or-duplicate']}, False),
        ]:
            with patch.object(mobile_turnstile, 'urlopen', return_value=io.BytesIO(json.dumps(result).encode())):
                self.assertEqual(mobile_turnstile.verify('valid', '127.0.0.1'), expected)
        self.assertFalse(mobile_turnstile.verify('x' * 2049, '127.0.0.1'))

    def browser_flow(self):
        status, flow = self.request('/api/v1/admin-app/auth/challenge/start', {})
        self.assertEqual(status, 200)
        return flow

    def browser_credentials(self, flow, password='test-only-password-123'):
        return {'username': 'admin@example.test', 'password': password,
                'challenge_id': flow['id'], 'challenge_secret': flow['secret']}

    def test_browser_flow_secret_is_not_exposed_in_page_or_database(self):
        flow = self.browser_flow()
        status, page = self.request(flow['url'])
        self.assertEqual(status, 200)
        self.assertIn(flow['id'], page)
        self.assertNotIn(flow['secret'], page)
        self.assertNotIn('test-secret', page)
        with app.db() as connection:
            row = connection.execute('SELECT secret_hash FROM admin_browser_challenges WHERE id=?', (flow['id'],)).fetchone()
            self.assertNotEqual(row['secret_hash'], flow['secret'])
        self.assertEqual(self.request('/api/v1/admin-app/auth/challenge/status', {'challenge_id': flow['id'], 'challenge_secret': '0' * 64})[0], 404)

    def test_pending_browser_flow_cannot_bypass_captcha(self):
        flow = self.browser_flow()
        with patch.object(admin_app_api, '_password_hash', side_effect=AssertionError('password bypass')):
            self.assertEqual(self.request('/api/v1/admin-app/auth/login', self.browser_credentials(flow))[0], 403)
        self.assertEqual(self.request('/api/v1/admin-app/auth/challenge/status', {'challenge_id': flow['id'], 'challenge_secret': flow['secret']})[1]['status'], 'pending')

    def test_browser_verification_allows_one_password_attempt_and_rejects_replay(self):
        flow = self.browser_flow()
        with patch.object(mobile_turnstile, 'verify', return_value=True) as verify:
            self.assertEqual(self.request('/api/v1/admin-app/auth/challenge/complete', {'challenge_id': flow['id'], 'turnstile_token': 'valid'})[0], 200)
            verify.assert_called_once_with('valid', '127.0.0.1')
        status, state = self.request('/api/v1/admin-app/auth/challenge/status', {'challenge_id': flow['id'], 'challenge_secret': flow['secret']})
        self.assertEqual((status, state['status']), (200, 'verified'))
        # No second Siteverify request: the browser token was already consumed.
        with patch.object(mobile_turnstile, 'verify', side_effect=AssertionError('duplicate Siteverify')):
            self.assertEqual(self.request('/api/v1/admin-app/auth/login', self.browser_credentials(flow))[0], 200)
            self.assertEqual(self.request('/api/v1/admin-app/auth/login', self.browser_credentials(flow))[0], 403)

    def test_wrong_password_consumes_browser_challenge(self):
        flow = self.browser_flow()
        with patch.object(mobile_turnstile, 'verify', return_value=True):
            self.request('/api/v1/admin-app/auth/challenge/complete', {'challenge_id': flow['id'], 'turnstile_token': 'valid'})
        self.assertEqual(self.request('/api/v1/admin-app/auth/login', self.browser_credentials(flow, 'wrong'))[0], 401)
        self.assertEqual(self.request('/api/v1/admin-app/auth/login', self.browser_credentials(flow))[0], 403)

    def test_browser_flow_expiry_and_cross_flow_secrets_are_rejected(self):
        flow, other = self.browser_flow(), self.browser_flow()
        with patch.object(mobile_turnstile, 'verify', return_value=True):
            self.request('/api/v1/admin-app/auth/challenge/complete', {'challenge_id': flow['id'], 'turnstile_token': 'valid'})
        wrong = self.browser_credentials(flow)
        wrong['challenge_secret'] = other['secret']
        self.assertEqual(self.request('/api/v1/admin-app/auth/login', wrong)[0], 403)
        with app.db() as connection:
            connection.execute('UPDATE admin_browser_challenges SET expires_at=0 WHERE id=?', (flow['id'],))
        self.assertEqual(self.request('/api/v1/admin-app/auth/login', self.browser_credentials(flow))[0], 403)

    def test_invalid_browser_token_or_service_outage_does_not_verify_flow(self):
        flow = self.browser_flow()
        body = {'challenge_id': flow['id'], 'turnstile_token': 'bad'}
        with patch.object(mobile_turnstile, 'verify', return_value=False):
            self.assertEqual(self.request('/api/v1/admin-app/auth/challenge/complete', body)[0], 403)
        with patch.object(mobile_turnstile, 'verify', side_effect=OSError()):
            self.assertEqual(self.request('/api/v1/admin-app/auth/challenge/complete', body)[0], 502)
        self.assertEqual(self.request('/api/v1/admin-app/auth/challenge/status', {'challenge_id': flow['id'], 'challenge_secret': flow['secret']})[1]['status'], 'pending')

    def test_browser_start_rate_limit(self):
        for _ in range(10):
            self.browser_flow()
        self.assertEqual(self.request('/api/v1/admin-app/auth/challenge/start', {})[0], 429)


    def test_inline_widget_page_has_same_site_session_and_no_password(self):
        flow = self.request('/api/v1/admin-app/auth/challenge/start', {})[1]
        status, page = self.request(flow['url'] + '&inline=1')
        self.assertEqual(status, 200)
        self.assertIn('#heading,#retry{display:none}', page)
        self.assertIn('人机验证已通过，可以安全登录', page)
        self.assertIn("message('success')", page)
        self.assertNotIn(flow['secret'], page)
        self.assertNotIn('test-only-password-123', page)

if __name__ == '__main__':
    unittest.main()
