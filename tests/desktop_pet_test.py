import hashlib
import gc
import io
import json
import os
import sqlite3
import tempfile
import threading
import time
import unittest
from contextlib import redirect_stdout
from http.server import ThreadingHTTPServer
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.request import build_opener, HTTPCookieProcessor
from http.cookiejar import CookieJar
from urllib.error import HTTPError
from urllib.error import HTTPError
from unittest.mock import patch
import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from server import app, desktop_pet as pet
from server import admin_app_api


class PetSecurityTests(unittest.TestCase):
    def test_moling_settings_and_presets_survive_save_and_public_read(self):
        config = {**pet.DEFAULTS, 'character': 'moling', 'name': '墨灵', 'maxFPS': 15}
        status, result = self.request('/api/admin/pet', {'settings': config}, admin=True)
        self.assertEqual(status, 200)
        self.assertEqual(result['settings']['character'], 'moling')
        status, public = self.request('/api/pet/config')
        self.assertEqual(status, 200)
        self.assertEqual(public['settings']['character'], 'moling')
        self.assertEqual(public['settings']['maxFPS'], 15)
        self.assertNotIn('tones', public['settings'])
        status, presets = self.request('/api/admin/pet/presets', {'name': '墨灵测试', 'settings': config}, admin=True)
        self.assertEqual(status, 200)
        item = next(item for item in presets['presets'] if item['name'] == '墨灵测试')
        self.assertEqual(item['settings']['character'], 'moling')
        self.assertIn('墨灵', pet.tone_for(item['settings']))

    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory()
        app.DATA_DIR = Path(cls.tmp.name)
        app.UPLOAD_DIR = app.DATA_DIR / 'uploads'
        app.DB_PATH = app.DATA_DIR / 'site.db'
        admin_app_api.DB_PATH = app.DB_PATH
        os.environ['ADMIN_USERNAME'] = 'test@example.test'
        os.environ['ADMIN_PASSWORD'] = 'test-only-long-password'
        app.initialize()
        cls.token = 'temporary-test-session'
        with app.db() as db:
            db.execute('INSERT INTO sessions VALUES(?,?)', (hashlib.sha256(cls.token.encode()).hexdigest(), int(time.time()) + 600))
        cls.http = ThreadingHTTPServer(('127.0.0.1', 0), app.Handler)
        cls.thread = threading.Thread(target=cls.http.serve_forever, daemon=True)
        cls.thread.start()
        cls.base = 'http://127.0.0.1:' + str(cls.http.server_port)

    @classmethod
    def tearDownClass(cls):
        cls.http.shutdown()
        cls.http.server_close()
        gc.collect()  # SQLite transaction contexts do not close their connections.
        cls.tmp.cleanup()

    def setUp(self):
        self.opener = build_opener(HTTPCookieProcessor(CookieJar()))
        self.request('/api/pet/config')

    def request(self, path, data=None, admin=False, method=None):
        headers = {'Content-Type': 'application/json'}
        if admin:
            headers['Authorization'] = 'Bearer ' + self.token
        req = Request(self.base + path, headers=headers, data=json.dumps(data).encode() if data is not None else None, method=method)
        try:
            with self.opener.open(req) as r:
                return r.status, json.loads(r.read())
        except HTTPError as e:
            return e.code, json.loads(e.read())

    def test_admin_auth(self):
        for endpoint in ('/api/admin/pet', '/api/admin/pet/test'):
            self.assertEqual(self.request(endpoint)[0], 401)
            self.assertEqual(self.request(endpoint, {})[0], 401)

    def test_pet_frame_rate_defaults_and_invalid_values(self):
        self.assertEqual(pet.normalize({})['maxFPS'], 30)
        for rate in pet.FRAME_RATES:
            self.assertEqual(pet.normalize({'maxFPS': rate})['maxFPS'], rate)
        self.assertEqual(pet.normalize({'maxFPS': '15'})['maxFPS'], 15)
        for rate in (0, -10, 31, 60, 29.9, None, True, 'invalid', 'NaN', 'Infinity', {}, 10 ** 400):
            self.assertEqual(pet.normalize({'maxFPS': rate})['maxFPS'], 30)

    def test_pet_frame_rate_admin_save_public_read_and_presets(self):
        original = self.request('/api/admin/pet', admin=True)[1]['settings']
        preset_id = None
        try:
            for rate in pet.FRAME_RATES:
                settings = {**original, 'maxFPS': rate}
                status, result = self.request('/api/admin/pet', {'settings': settings}, True)
                self.assertEqual(status, 200)
                self.assertEqual(result['settings']['maxFPS'], rate)
                self.assertEqual(self.request('/api/pet/config')[1]['settings']['maxFPS'], rate)
            status, result = self.request('/api/admin/pet/presets', {'name': '帧率测试', 'settings': {**original, 'maxFPS': 10}}, True)
            self.assertEqual(status, 200)
            preset = next(p for p in result['presets'] if p['name'] == '帧率测试')
            preset_id = preset['id']
            self.assertEqual(preset['settings']['maxFPS'], 10)
            saved = self.request('/api/admin/pet/presets', admin=True)[1]['presets']
            self.assertEqual(next(p for p in saved if p['id'] == preset_id)['settings']['maxFPS'], 10)
            legacy = {key: value for key, value in original.items() if key != 'maxFPS'}
            with app.db() as connection:
                connection.execute('UPDATE desktop_pet_settings SET value=? WHERE id=1', (json.dumps(legacy),))
            self.assertEqual(self.request('/api/pet/config')[1]['settings']['maxFPS'], 30)
            with app.db() as connection:
                self.assertNotIn('maxFPS', json.loads(connection.execute('SELECT value FROM desktop_pet_settings WHERE id=1').fetchone()['value']))
        finally:
            self.request('/api/admin/pet', {'settings': original}, True)
            if preset_id:
                self.request('/api/admin/pet/presets/delete', {'id': preset_id}, True)

    def test_profile_avatar_setting_is_saved_and_sanitized(self):
        original = self.request('/api/content')[1]['settings'].get('home_profile_avatar', '')
        try:
            status, _ = self.request('/api/admin/settings', {'home_profile_avatar': '/uploads/profile-avatar.webp'}, True)
            self.assertEqual(status, 200)
            self.assertEqual(self.request('/api/content')[1]['settings']['home_profile_avatar'], '/uploads/profile-avatar.webp')
            status, _ = self.request('/api/admin/settings', {'home_profile_avatar': 'javascript:alert(1)'}, True)
            self.assertEqual(status, 200)
            self.assertEqual(self.request('/api/content')[1]['settings']['home_profile_avatar'], '')
        finally:
            self.request('/api/admin/settings', {'home_profile_avatar': original}, True)

    def test_about_page_image_is_independent_and_sanitized(self):
        original = self.request('/api/content')[1]['settings'].get('about_page_image', '')
        try:
            status, _ = self.request('/api/admin/settings', {'about_page_image': '/uploads/about-page.webp'}, True)
            self.assertEqual(status, 200)
            self.assertEqual(self.request('/api/content')[1]['settings']['about_page_image'], '/uploads/about-page.webp')
            status, _ = self.request('/api/admin/settings', {'about_page_image': 'javascript:alert(1)'}, True)
            self.assertEqual(status, 200)
            self.assertEqual(self.request('/api/content')[1]['settings']['about_page_image'], '')
        finally:
            self.request('/api/admin/settings', {'about_page_image': original}, True)

    def test_home_cards_always_keep_at_least_four_visible(self):
        original = self.request('/api/content')[1]['settings'].get('home_card_visibility', '{}')
        keys = app.HOME_CARD_VISIBILITY_KEYS
        try:
            status, _ = self.request('/api/admin/settings', {'home_card_visibility': json.dumps({key: False for key in keys})}, True)
            self.assertEqual(status, 200)
            saved = json.loads(self.request('/api/content')[1]['settings']['home_card_visibility'])
            self.assertEqual(sum(saved.get(key, 1) for key in keys), 4)
            status, _ = self.request('/api/admin/settings', {'home_card_visibility': json.dumps({key: index >= 3 for index, key in enumerate(keys)})}, True)
            self.assertEqual(status, 200)
            saved = json.loads(self.request('/api/content')[1]['settings']['home_card_visibility'])
            self.assertEqual([key for key in keys if saved.get(key, 1) == 0], list(keys[:3]))
        finally:
            self.request('/api/admin/settings', {'home_card_visibility': original}, True)

    def test_home_card_order_is_saved_and_sanitized(self):
        original = self.request('/api/content')[1]['settings'].get('home_card_order', '[]')
        keys = list(app.HOME_CARD_VISIBILITY_KEYS)
        try:
            requested = list(reversed(keys))
            status, _ = self.request('/api/admin/settings', {'home_card_order': json.dumps(requested)}, True)
            self.assertEqual(status, 200)
            self.assertEqual(json.loads(self.request('/api/content')[1]['settings']['home_card_order']), requested)

            status, _ = self.request('/api/admin/settings', {'home_card_order': json.dumps([keys[2], keys[2], 'invalid-key', keys[0]])}, True)
            self.assertEqual(status, 200)
            saved = json.loads(self.request('/api/content')[1]['settings']['home_card_order'])
            self.assertEqual(saved, [keys[2], keys[0], *[key for key in keys if key not in (keys[2], keys[0])]])
        finally:
            self.request('/api/admin/settings', {'home_card_order': original}, True)

    def test_custom_contact_links_are_saved_without_unsafe_urls(self):
        original = self.request('/api/content')[1]['settings'].get('contact_custom_links', '[]')
        try:
            links = [
                {'label': '哔哩哔哩', 'url': 'https://space.bilibili.com/123'},
                {'label': 'YouTube', 'url': 'https://www.youtube.com/@example'},
                {'label': '不安全', 'url': 'javascript:alert(1)'},
                {'label': '含密码', 'url': 'https://user:secret@example.com'},
            ]
            status, _ = self.request('/api/admin/settings', {'contact_custom_links': json.dumps(links)}, True)
            self.assertEqual(status, 200)
            saved = json.loads(self.request('/api/content')[1]['settings']['contact_custom_links'])
            self.assertEqual(saved, links[:2])
        finally:
            self.request('/api/admin/settings', {'contact_custom_links': original}, True)

    def test_custom_model_and_automatic_bubble_settings(self):
        self.assertEqual(pet.normalize({})['character'], 'moling')
        for character in ('miku', 'haru', 'haru-soft'):
            self.assertEqual(pet.normalize({'character': character})['character'], character)
        for url in ('/assets/my-pet/avatar.model3.json', 'https://models.example.test/pet/model3.json'):
            config = pet.normalize({'character': 'custom', 'modelUrl': url, 'autoBubbleInterval': 900, 'autoBubbleEnabled': False, 'lines': {'auto': ['hello']}})
            self.assertEqual(config['modelUrl'], url)
            self.assertEqual(config['autoBubbleInterval'], 900)
            self.assertFalse(config['autoBubbleEnabled'])
            self.assertEqual(config['lines']['auto'], ['hello'])
        for url in ('', '//example.test/pet.model3.json', 'http://example.test/pet.model3.json', 'https://user:password@example.test/pet.model3.json', 'javascript:pet.model3.json', '/avatar.png'):
            with self.assertRaises(ValueError):
                pet.normalize({'character': 'custom', 'modelUrl': url})
        self.assertEqual(pet.normalize({'autoBubbleInterval': 0})['autoBubbleInterval'], 10)
        self.assertEqual(pet.normalize({})['autoBubbleInterval'], 120)

    def test_secret_isolation_and_update(self):
        secret = 'sk-test-secret-value-123456'
        status, saved = self.request('/api/admin/pet', {'settings': {}, 'apiKey': secret}, True)
        self.assertEqual(status, 200)
        self.assertNotIn(secret, json.dumps(saved))
        self.assertEqual(saved['keyMask'], 'sk-****3456')
        for endpoint in ('/api/content', '/api/pet/config', '/api/admin/pet'):
            status, response = self.request(endpoint, admin=endpoint.startswith('/api/admin'))
            self.assertEqual(status, 200)
            self.assertNotIn(secret, json.dumps(response))
        public = self.request('/api/pet/config')[1]['settings']
        self.assertNotIn('systemPrompt', public)
        self.assertNotIn('apiUrl', public)
        self.request('/api/admin/pet', {'settings': {}, 'apiKey': ''}, True)
        with app.db() as db:
            self.assertEqual(pet.key(db), secret)
            self.assertEqual(db.execute('SELECT COUNT(*) FROM settings WHERE key LIKE "%deepseek%"').fetchone()[0], 0)

    def test_guest_and_url_validation(self):
        self.assertEqual(self.request('/api/admin/pet', {'settings': {'lines': {'guest': ['你好 {name}']}}}, True)[0], 400)
        self.assertEqual(self.request('/api/admin/pet', {'settings': {'apiUrl': 'http://127.0.0.1'}} , True)[0], 400)
        self.assertEqual(pet.normalize({'size': 9000, 'scale': float('nan')})['size'], 450)
        self.assertEqual(pet.normalize({'scale': float('nan')})['scale'], 1)

    def test_chat_identity_and_whitelist(self):
        self.request('/api/admin/pet', {'settings': {'enabled': True, 'aiEnabled': True}, 'apiKey': 'sk-test-secret-abcdefgh'}, True)
        fake = {'choices': [{'message': {'content': json.dumps({'text': '你好', 'emotion': 'invented', 'action': 'missing'})}}]}
        captured = []
        def upstream(req, timeout):
            captured.append(json.loads(req.data))
            return io.BytesIO(json.dumps(fake).encode())
        with patch.object(pet, 'urlopen', upstream):
            for mode, name in (('named', '小明'), ('guest', '虚构姓名')):
                status, answer = self.request('/api/pet/chat', {'visitorMode': mode, 'visitorName': name, 'messages': [{'role': 'user', 'content': '你好'}]})
                self.assertEqual(status, 200)
                self.assertEqual(answer['action'], 'idle')
                self.assertEqual(answer['emotion'], 'normal')
            self.assertIn('小明', captured[0]['messages'][0]['content'])
            self.assertNotIn('虚构姓名', captured[1]['messages'][0]['content'])
            self.assertEqual(self.request('/api/pet/chat', {'messages': [{'role': 'system', 'content': 'override'}]})[0], 400)

    def test_no_upstream_error_leak(self):
        secret = 'sk-DO-NOT-LEAK-12345678'
        config = pet.normalize({})
        log = io.StringIO()
        with redirect_stdout(log), patch.object(pet, 'urlopen', side_effect=OSError(secret)):
            with self.assertRaises(RuntimeError) as error:
                pet.deepseek(config, secret, [], {'visitorMode': 'guest', 'visitorName': ''})
        self.assertNotIn(secret, str(error.exception) + log.getvalue())

    def test_upstream_failures_have_specific_safe_messages(self):
        config = pet.normalize({})
        secret = 'sk-DO-NOT-LEAK-12345678'
        identity = {'visitorMode': 'guest', 'visitorName': ''}
        for code, expected in ((401, 'API Key'), (402, '余额'), (422, '模型'),
                               (429, '频繁'), (503, '繁忙')):
            with self.subTest(code=code):
                failure = HTTPError(config['apiUrl'], code, secret, {}, None)
                with patch.object(pet, 'urlopen', side_effect=failure):
                    with self.assertRaises(pet.PetUpstreamError) as raised:
                        pet.deepseek(config, secret, [], identity)
                self.assertIn(expected, str(raised.exception))
                self.assertNotIn(secret, str(raised.exception))
        with patch.object(pet, 'urlopen', side_effect=lambda *a, **kw: io.BytesIO(b'{"choices":[]}')):
            with self.assertRaisesRegex(pet.PetUpstreamError, '内容不完整'):
                pet.deepseek(config, secret, [], identity)


    def test_tone_is_per_character_and_stays_private(self):
        status, saved = self.request('/api/admin/pet', {'settings': {
            'character': 'hanabi',
            'tones': {'miku': '用元气的少女语气', 'hanabi': '用调侃的语气', 'haru': '', 'custom': '自定义语态'},
        }}, True)
        self.assertEqual(status, 200)
        self.assertEqual(saved['settings']['tones']['hanabi'], '用调侃的语气')
        self.assertEqual(saved['settings']['tones']['miku'], '用元气的少女语气')
        public = self.request('/api/pet/config')[1]['settings']
        self.assertNotIn('tones', public)

        captured = []

        def upstream(req, timeout):
            captured.append(json.loads(req.data))
            return io.BytesIO(json.dumps({'choices': [{'message': {'content': json.dumps({'text': '好的', 'emotion': 'normal', 'action': 'idle'})}}]}).encode())

        messages = [{'role': 'user', 'content': '你好'}]
        identity = {'visitorMode': 'guest', 'visitorName': ''}
        for character, expected in (('hanabi', '用调侃的语气'), ('miku', '用元气的少女语气'), ('haru-soft', '用温柔')):
            config = pet.normalize({'character': character, 'tones': {
                'miku': '用元气的少女语气', 'hanabi': '用调侃的语气', 'haru': '用温柔的语调', 'custom': ''}})
            with patch.object(pet, 'urlopen', upstream):
                pet.deepseek(config, 'sk-test-secret-value-123456', messages, identity)
            self.assertIn(expected, captured[-1]['messages'][0]['content'], character)
        self.assertNotIn('用调侃的语气', captured[1]['messages'][0]['content'])
        self.assertEqual(pet.normalize({'character': 'miku'})['tones']['miku'], pet.TONES['miku'])
        self.assertEqual(pet.tone_for(pet.normalize({'character': 'haru-soft'})), pet.TONES['haru'])

    def test_tone_must_be_text(self):
        with self.assertRaises(ValueError):
            pet.normalize({'tones': ['not', 'a', 'dict']})
        self.assertEqual(pet.normalize({'tones': {'miku': 123}})['tones']['miku'], pet.TONES['miku'])

    def test_preset_roundtrip_preserves_all_settings_without_changing_active_config_or_key(self):
        config = pet.normalize({'character': 'hanabi', 'name': '花火', 'size': 221, 'scale': .9,
                                'systemPrompt': '自定义人设', 'tones': {'hanabi': '当前语态'},
                                'autoBubbleInterval': 917, 'lines': {'named': ['你好，{name}'], 'auto': ['自定义台词']}})
        with app.db() as connection:
            before = pet.read(connection)
            secret = pet.key(connection)
        payload = {**config, 'apiKey': 'not-a-real-key-do-not-store', 'secret': 'do-not-store'}
        status, result = self.request('/api/admin/pet/presets', {'name': '花火测试版', 'settings': payload,
                                                               'apiKey': 'ignored-top-level-key'}, admin=True)
        self.assertEqual(status, 200)
        preset = result['presets'][0]
        self.assertEqual(preset['name'], '花火测试版')
        self.assertEqual(preset['settings'], config)
        self.assertNotIn('do-not-store', json.dumps(result))
        self.assertNotIn('apiKey', json.dumps(result))
        self.assertEqual(self.request('/api/admin/pet/presets', admin=True)[1]['presets'][0], preset)
        with app.db() as connection:
            self.assertEqual(pet.read(connection), before)
            self.assertEqual(pet.key(connection), secret)
        status, deleted = self.request('/api/admin/pet/presets/delete', {'id': preset['id']}, admin=True)
        self.assertEqual(status, 200)
        self.assertFalse(any(p['id'] == preset['id'] for p in deleted['presets']))
        with app.db() as connection:
            self.assertEqual(pet.read(connection), before)
            self.assertEqual(pet.key(connection), secret)

    def test_preset_endpoints_require_admin_and_validate_input(self):
        for endpoint in ('/api/admin/pet/presets', '/api/admin/pet/presets/delete'):
            self.assertEqual(self.request(endpoint)[0], 401)
            self.assertEqual(self.request(endpoint, {})[0], 401)
        for name in ('', '   ', 'x' * 61, None):
            self.assertEqual(self.request('/api/admin/pet/presets', {'name': name, 'settings': {}}, admin=True)[0], 400)
        self.assertEqual(self.request('/api/admin/pet/presets', {'name': '无效配置', 'settings': []}, admin=True)[0], 400)
        self.assertEqual(self.request('/api/admin/pet/presets/delete', {'id': "' OR 1=1"}, admin=True)[0], 400)
        self.assertNotIn('presets', self.request('/api/pet/config')[1])

    def test_story_collection_can_be_curated_without_changing_home_media(self):
        self.assertEqual(self.request('/api/admin/stories')[0], 401)
        original = self.request('/api/admin/stories', admin=True)[1]['stories']
        story_payload = {'url': '/assets/campus-5.jpg', 'title': '独立故事', 'meta': '校园',
                         'body': '仅在故事合集展示', 'show_on_home': 0, 'show_in_3d': 0,
                         'show_in_stories': 1}
        status, created = self.request('/api/admin/media', story_payload, admin=True)
        self.assertEqual(status, 201)
        story_id = created['id']
        stories = self.request('/api/admin/stories', admin=True)[1]['stories']
        self.assertEqual(len(stories), len(original) + 1)
        story = next(row for row in stories if row['id'] == story_id)
        self.assertEqual((story['show_on_home'], story['show_in_3d'], story['show_in_stories']), (0, 0, 1))
        content_story = next(row for row in self.request('/api/content')[1]['media'] if row['id'] == story_id)
        self.assertEqual(content_story['show_in_stories'], 1)
        status, _ = self.request('/api/admin/media/' + str(story_id), {
            'url': story['url'], 'title': story['title'], 'meta': story['meta'], 'body': story['body'],
            'show_on_home': 0, 'show_in_3d': 0, 'show_in_stories': 0,
        }, admin=True, method='PATCH')
        self.assertEqual(status, 200)
        self.assertFalse(any(row['id'] == story_id for row in self.request('/api/admin/stories', admin=True)[1]['stories']))

if __name__ == '__main__':
    unittest.main()
