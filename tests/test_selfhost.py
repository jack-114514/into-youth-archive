"""Exercise a truly fresh database and preserve owner edits across restarts."""
import importlib
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import threading
import unittest
from unittest.mock import patch
from urllib.error import HTTPError
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT/'scripts'))
from configure import read_env, write_env, validate

class ConfigurationTests(unittest.TestCase):
    def config(self):
        return dict(DOMAIN='photos.example.org', ACME_EMAIL='owner@example.org', ADMIN_USERNAME='owner@example.org',
          ADMIN_PASSWORD="a strong $password with 'quotes' and \\slash", PASSWORD_CODE_PEPPER='x'*48,
          HTTP_PORT='80', HTTPS_PORT='443', SMTP_PORT='465', SMTP_SECURITY='ssl',
          TURNSTILE_SITE_KEY='', TURNSTILE_SECRET_KEY='', TURNSTILE_ALLOWED_HOSTNAMES='photos.example.org')
    def test_private_config_round_trip_special_characters(self):
        with tempfile.TemporaryDirectory() as temp:
            path=Path(temp)/'.env'; values=self.config(); write_env(path, values)
            saved=read_env(path)
            for k, v in values.items(): self.assertEqual(saved[k], v)
            if os.name != 'nt': self.assertEqual(path.stat().st_mode & 0o777, 0o600)
    def test_rejects_domain_injection_and_incomplete_cloudflare(self):
        for domain in ['https://photos.example.org', 'example.org { reverse_proxy attacker }', '*.example.org', 'localhost']:
            with self.assertRaises(ValueError): validate({**self.config(), 'DOMAIN':domain})
        with self.assertRaises(ValueError): validate({**self.config(), 'TURNSTILE_SITE_KEY':'sample'})

class FreshSiteTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp=tempfile.TemporaryDirectory()
        cls.environment=patch.dict(os.environ, {
          'SITE_DATA_DIR': str(Path(cls.temp.name)/'data'), 'SITE_UPLOAD_DIR': str(Path(cls.temp.name)/'uploads'),
          'ADMIN_USERNAME':'owner@example.org', 'ADMIN_PASSWORD':'first-test-password-1234',
          'TURNSTILE_SITE_KEY':'', 'TURNSTILE_SECRET_KEY':'', 'SMTP_HOST':'',
        })
        cls.environment.start()
        cls.app=importlib.import_module('server.app'); cls.app.initialize()
        cls.server=cls.app.ThreadingHTTPServer(('127.0.0.1',0), cls.app.Handler)
        cls.thread=threading.Thread(target=cls.server.serve_forever, daemon=True); cls.thread.start()
        cls.origin=f'http://127.0.0.1:{cls.server.server_port}'
    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown(); cls.server.server_close(); cls.thread.join(); cls.environment.stop(); cls.temp.cleanup()
    def request(self, path, data=None, token=None, method=None):
        headers={'Content-Type':'application/json'}
        if token: headers['Authorization']='Bearer '+token
        req=Request(self.origin+path, data=None if data is None else json.dumps(data).encode(), headers=headers, method=method)
        with urlopen(req, timeout=10) as response: return json.load(response)
    def test_01_fresh_content_contains_only_demo_media(self):
        self.assertTrue(self.request('/api/health')['ok'])
        data=self.request('/api/content'); self.assertEqual(len(data['media']),16)
        self.assertEqual(data['settings']['contact_email'],''); self.assertEqual(data['settings']['github_url'],'')
        for item in data['media']: self.assertTrue(item['url'].startswith('/assets/demo-'))
        self.assertEqual(self.request('/api/comments')['comments'],[])
        config=self.request('/api/public-config'); self.assertEqual(config['turnstile_site_key'],'')
        self.assertFalse(config['password_recovery_enabled']); self.assertEqual(len(config),2)
    def test_02_own_admin_authenticates_both_clients(self):
        token=self.request('/api/admin/login', {'username':'owner@example.org','password':'first-test-password-1234'})['token']
        self.assertIn('media',self.request('/api/admin/media',token=token))
        mobile=self.request('/api/v1/admin-app/auth/login', {'username':'owner@example.org','password':'first-test-password-1234'})
        self.assertIn('access_token',mobile); self.assertIn('refresh_token',mobile)
        for path in ('/api/admin/media', '/api/v1/admin-app/dashboard'):
            with self.assertRaises(HTTPError) as error: self.request(path)
            self.assertEqual(error.exception.code,401)
    def test_03_restart_preserves_password_content_and_deletions(self):
        with self.app.db() as connection:
            connection.execute("UPDATE settings SET value='My own story' WHERE key='site_title'")
            connection.execute('DELETE FROM media')
        with patch.dict(os.environ,{'ADMIN_PASSWORD':'a-different-env-password'}): self.app.initialize()
        data=self.request('/api/content'); self.assertEqual(data['settings']['site_title'],'My own story')
        self.assertEqual(data['media'],[])
        self.assertIn('token',self.request('/api/admin/login', {'username':'owner@example.org','password':'first-test-password-1234'}))
    def test_04_public_cloudflare_config_excludes_secrets(self):
        with patch.dict(os.environ, {'TURNSTILE_SITE_KEY':'own-site-key', 'TURNSTILE_SECRET_KEY':'private-secret',
          'TURNSTILE_ALLOWED_HOSTNAMES':'photos.example.org', 'SMTP_HOST':'smtp.example.org', 'SMTP_USERNAME':'owner@example.org',
          'SMTP_PASSWORD':'private-mail-password', 'PASSWORD_CODE_PEPPER':'x'*48}):
            data=self.request('/api/public-config'); self.assertTrue(data['password_recovery_enabled'])
            self.assertEqual(data['turnstile_site_key'],'own-site-key')
            self.assertNotIn('private',json.dumps(data))

    def test_05_native_pet_contract_preserves_layout_and_hides_key(self):
        mobile=self.request('/api/v1/admin-app/auth/login', {'username':'owner@example.org','password':'first-test-password-1234'})
        token=mobile['access_token']
        read=self.request('/api/v1/admin-app/pet',token=token)
        settings={**read['settings'], 'character':'moling', 'name':'墨灵', 'maxTokens':10000, 'maxFPS':15, 'size':267, 'systemPrompt':'自己的专属人设'}
        saved=self.request('/api/v1/admin-app/pet', {'settings':settings,'apiKey':'fixture-only-key-123'}, token=token, method='PATCH')
        for key in ('maxTokens','maxFPS','size','systemPrompt'): self.assertEqual(saved['settings'][key],settings[key])
        self.assertTrue(saved['keyConfigured'])
        self.assertNotIn('fixture-only-key-123',json.dumps(saved))
        public=self.request('/api/pet/config')['settings']
        for key in ('maxTokens','systemPrompt','tones','apiKey'): self.assertNotIn(key,public)
        self.assertEqual(public['character'],'moling')
        kept=self.request('/api/v1/admin-app/pet', {'settings':settings}, token=token, method='PATCH')
        self.assertEqual(kept['keyMask'],saved['keyMask'])
        for method in ('GET','PATCH'):
            with self.assertRaises(HTTPError) as error: self.request('/api/v1/admin-app/pet',None if method=='GET' else {'settings':settings},method=method)
            self.assertEqual(error.exception.code,401)

if __name__=='__main__': unittest.main()
