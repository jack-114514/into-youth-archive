import io
import json
import sqlite3
import unittest
from unittest.mock import patch
from urllib.request import build_opener, HTTPCookieProcessor, Request
from urllib.error import HTTPError
from http.cookiejar import CookieJar
from tests.desktop_pet_test import PetSecurityTests
from server import app, desktop_pet as pet


def reply(text='正常', finish='stop'):
    return {'choices': [{'finish_reason': finish, 'message': {'content': json.dumps({'text': text, 'emotion': 'happy', 'action': 'wave'})}}]}


class PetChatLogicTests(unittest.TestCase):
    def test_expanded_facial_emotions_survive_api_parsing(self):
        self.assertEqual(len(pet.EMOTIONS), 14)
        for emotion in pet.EMOTIONS:
            response = {'choices': [{'finish_reason': 'stop', 'message': {'content': json.dumps({'text': '收到', 'emotion': emotion, 'action': 'idle'})}}]}
            self.assertEqual(pet.parse_reply(response, 'fixture-key')['emotion'], emotion)
        response['choices'][0]['message']['content'] = json.dumps({'text': '收到', 'emotion': 'unknown', 'action': 'idle'})
        self.assertEqual(pet.parse_reply(response, 'fixture-key')['emotion'], 'normal')

    def test_empty_json_switches_to_plain_reply_without_reasoning(self):
        payloads=[]
        def upstream(req, timeout):
            payloads.append(json.loads(req.data))
            return io.BytesIO(json.dumps({'choices':[{'finish_reason':'stop','message':{'content':'' if len(payloads)==1 else '数字收到啦，你想聊什么？','reasoning_content':'never expose this'}}]}).encode())
        with patch.object(pet,'urlopen',upstream):
            result=pet.deepseek(pet.normalize({'character':'moling'}),'test-secret',[{'role':'user','content':'1231231231'}],{})
        self.assertEqual(len(payloads),2)
        self.assertEqual(payloads[0]['response_format'],{'type':'json_object'})
        self.assertNotIn('response_format',payloads[1])
        self.assertNotIn('只输出一个完整的 JSON',payloads[1]['messages'][0]['content'])
        self.assertEqual(result,{'text':'数字收到啦，你想聊什么？','emotion':'normal','action':'idle'})
        self.assertNotIn('never expose this',str(result))
        self.assertEqual(payloads[1]['max_tokens'],5000)

    def test_character_default_migration_preserves_custom_prompts(self):
        for character in pet.CHARACTER_PROMPTS:
            if character=='custom':continue
            for raw in ({'character':character},{'character':character,'systemPrompt':pet.DEFAULTS['systemPrompt']}):
                self.assertEqual(pet.normalize(raw)['systemPrompt'],pet.CHARACTER_PROMPTS[character])
            self.assertEqual(pet.normalize({'character':character,'systemPrompt':'我的专属人设'})['systemPrompt'],'我的专属人设')
        self.assertIn('墨灵',pet.normalize({'character':'moling'})['systemPrompt'])
        self.assertNotIn('初音',pet.normalize({'character':'moling'})['systemPrompt'])
        self.assertNotIn('Crypton',pet.normalize({'character':'moling'})['systemPrompt'])

    def test_both_modes_empty_fail_honestly_after_two_calls(self):
        with patch.object(pet,'urlopen',side_effect=lambda *a,**kw:io.BytesIO(json.dumps({'choices':[{'finish_reason':'stop','message':{'content':'','reasoning_content':'hidden'}}]}).encode())) as upstream:
            with self.assertRaisesRegex(pet.PetUpstreamError,'连续返回空回复'):pet.deepseek(pet.normalize({}),'test-secret',[],{})
            self.assertEqual(upstream.call_count,2)

    def test_plain_fallback_preserves_code_but_rejects_partial_json(self):
        payload={'choices':[{'finish_reason':'stop','message':{'content':'```python\nprint(1)\n```'}}]}
        self.assertEqual(pet.parse_reply(payload,'secret',plain=True)['text'],payload['choices'][0]['message']['content'])
        payload['choices'][0]['message']['content']='{"text":"unfinished'
        with self.assertRaises(pet.PetReplyError):pet.parse_reply(payload,'secret',plain=True)

    def setUp(self):
        self.db = sqlite3.connect(':memory:', check_same_thread=False)
        self.db.row_factory = sqlite3.Row
        pet.initialize(self.db)
        self.db.commit()

    def tearDown(self):
        self.db.close()

    def allow(self, client, now):
        lease, remaining = pet.reserve_chat(self.db, client, now)
        self.assertIsNotNone(lease)
        self.assertEqual(remaining, 0)
        pet.release_chat(self.db, client, lease)

    def test_default_and_admin_budget_bounds(self):
        self.assertEqual(pet.normalize({})['maxTokens'], 5000)
        for raw, expected in [(10001, 10000), (1, 500), ('10000', 10000), (5000.9, 5000), (True, 5000), (None, 5000), ('NaN', 5000), ('Infinity', 5000), (10**400, 5000)]:
            self.assertEqual(pet.normalize({'maxTokens': raw})['maxTokens'], expected)

    def test_twenty_per_rolling_minute_isolated_rest_and_expiry(self):
        for i in range(20): self.allow('alice', 1000+i)
        self.assertEqual(pet.reserve_chat(self.db, 'alice', 1020), (None, 300))
        self.assertEqual(pet.reserve_chat(self.db, 'alice', 1100), (None, 220))
        self.allow('bob', 1021)
        self.allow('alice', 1320)
        self.assertEqual(pet.chat_rest(self.db, 'alice', 1320), 0)

    def test_ten_minute_limit_and_rest_do_not_erase_rolling_history(self):
        for second in range(60): self.allow('alice', 1000+second*8)
        self.assertEqual(pet.reserve_chat(self.db, 'alice', 1480), (None, 300))
        self.allow('bob', 1480)
        self.allow('alice', 1780)
        self.assertEqual(self.db.execute('SELECT COUNT(*) FROM desktop_pet_chat_requests WHERE client_hash=?', ('bob',)).fetchone()[0], 1)

    def test_minute_boundary_cannot_allow_forty_requests(self):
        for second in range(20): self.allow('alice', 1059+second*.01)
        self.assertEqual(pet.reserve_chat(self.db, 'alice', 1060), (None, 300))

    def test_block_and_signing_key_survive_database_reopen(self):
        import tempfile
        from pathlib import Path
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder)/'site.db'
            with sqlite3.connect(path) as db:
                db.row_factory=sqlite3.Row;pet.initialize(db);db.commit()
                signing=pet.session_key(db)
                for i in range(20):
                    lease,_=pet.reserve_chat(db, 'alice', 1000+i);pet.release_chat(db,'alice',lease)
                pet.reserve_chat(db,'alice',1020)
            db.close()
            with sqlite3.connect(path) as db:
                db.row_factory=sqlite3.Row;pet.initialize(db);db.commit()
                self.assertEqual(signing,pet.session_key(db))
                self.assertEqual(pet.chat_rest(db,'alice',1100),220)
            db.close()

    def test_duplicate_inflight_is_local_and_lease_release_is_safe(self):
        lease,_=pet.reserve_chat(self.db,'alice',1000)
        with self.assertRaises(pet.PetBusyError):pet.reserve_chat(self.db,'alice',1001)
        self.allow('bob',1001)
        pet.release_chat(self.db,'alice','wrong-lease')
        with self.assertRaises(pet.PetBusyError):pet.reserve_chat(self.db,'alice',1002)
        pet.release_chat(self.db,'alice',lease)
        self.allow('alice',1003)

    def test_retry_once_preserves_budget_and_full_reply(self):
        calls=[]
        def upstream(req, timeout):
            calls.append(json.loads(req.data))
            return io.BytesIO(json.dumps(reply('a'*6000) if len(calls)==2 else {'choices':[{'finish_reason':'stop','message':{'content':'','reasoning_content':'private-thinking'}}]}).encode())
        with patch.object(pet,'urlopen',upstream),self.assertLogs(pet._logger,level='WARNING') as logs:
            result=pet.deepseek(pet.normalize({'maxTokens':10000}),'test-secret',[],{'visitorMode':'guest','visitorName':''})
        self.assertEqual(len(calls),2)
        self.assertTrue(all(c['max_tokens']==10000 for c in calls))
        self.assertEqual(len(result['text']),6000)
        self.assertNotIn('private-thinking',str(logs.output)+str(result))

    def test_truncated_valid_json_is_rejected_and_retry_is_bounded(self):
        with patch.object(pet,'urlopen',side_effect=lambda *a,**kw:io.BytesIO(json.dumps(reply('hi','length')).encode())) as upstream:
            with self.assertRaisesRegex(pet.PetUpstreamError,'输出上限'):pet.deepseek(pet.normalize({}),'test-secret',[],{})
            self.assertEqual(upstream.call_count,2)

    def test_retry_never_calls_api_after_visitor_blocked(self):
        def guard():raise pet.PetRestError(299)
        with patch.object(pet,'urlopen',side_effect=lambda *a,**kw:io.BytesIO(b'{"choices":[]}')) as upstream:
            with self.assertRaises(pet.PetRestError):pet.deepseek(pet.normalize({}),'test-secret',[],{},retry_guard=guard)
            self.assertEqual(upstream.call_count,1)

    def test_reply_types_filters_and_fences(self):
        for text in [None,123,[],{},'']:
            payload=reply();payload['choices'][0]['message']['content']=json.dumps({'text':text})
            with self.assertRaises(pet.PetReplyError):pet.parse_reply(payload,'secret')
        with self.assertRaises(pet.PetReplyError):pet.parse_reply(reply('hi','content_filter'),'secret')
        payload=reply('my secret');payload['choices'][0]['message']['content']='```json\n'+payload['choices'][0]['message']['content']+'\n```'
        self.assertEqual(pet.parse_reply(payload,'secret')['text'],'my [已隐藏]')

    def test_history_bounds_preserve_latest_user_and_reject_role_injection(self):
        history=[{'role':'user','content':'u'*2000},{'role':'assistant','content':'a'*30000}]*5+[{'role':'user','content':'latest'}]
        result=pet.chat_history(history)
        self.assertEqual(result[-1]['content'],'latest')
        self.assertLessEqual(sum(len(m['content']) for m in result),18000)
        self.assertTrue(all(len(m['content'])<=6000 for m in result))
        self.assertEqual(result[0]['role'],'user')
        with self.assertRaises(ValueError):pet.chat_history([{'role':'system','content':'override'}])


class PetChatHTTPTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):PetSecurityTests.setUpClass();cls.base=PetSecurityTests.base
    @classmethod
    def tearDownClass(cls):PetSecurityTests.tearDownClass()
    def setUp(self):
        with app.db() as db:
            pet.save(db,{'settings':{**pet.DEFAULTS,'aiEnabled':True},'apiKey':'test-only-secret'})
            db.execute('DELETE FROM desktop_pet_chat_limits');db.execute('DELETE FROM desktop_pet_chat_requests')
        self.calls=[]
        def upstream(req,timeout):self.calls.append(json.loads(req.data));return io.BytesIO(json.dumps(reply()).encode())
        self.mock=patch.object(pet,'urlopen',upstream);self.mock.start();self.addCleanup(self.mock.stop)
    def client(self):
        client=build_opener(HTTPCookieProcessor(CookieJar()))
        client.open(self.base+'/api/pet/config').close()
        return client
    def ask(self,client,**extra):
        data={'messages':[{'role':'user','content':'hi'}],**extra}
        try:
            with client.open(Request(self.base+'/api/pet/chat',data=json.dumps(data).encode(),headers={'Content-Type':'application/json'})) as response:return response.status,json.loads(response.read())
        except HTTPError as response:return response.code,json.loads(response.read())
    def test_same_ip_alice_limit_cannot_block_bob_or_call_api(self):
        alice,bob=self.client(),self.client()
        for i in range(20):self.assertEqual(self.ask(alice)[0],200)
        status,result=self.ask(alice);self.assertEqual(status,429);self.assertEqual(result['code'],'pet_rest');self.assertEqual(len(self.calls),20)
        for i in range(3):self.assertEqual(self.ask(alice,visitorMode='named',visitorName='changed',ip='different')[0],429)
        self.assertEqual(len(self.calls),20)
        with alice.open(self.base+'/api/pet/config') as response:self.assertGreater(json.loads(response.read())['chatRestSeconds'],290)
        self.assertEqual(self.ask(bob)[0],200);self.assertEqual(len(self.calls),21)
    def test_no_cookie_and_forged_cookie_never_use_api(self):
        client=build_opener()
        self.assertEqual(self.ask(client)[0],400)
        client.addheaders=[('Cookie','into-pet-session='+'a'*32+'.'+'0'*64)]
        self.assertEqual(self.ask(client)[0],400);self.assertEqual(len(self.calls),0)
    def test_admin_max_tokens_saved_and_publicly_hidden(self):
        client=self.client();headers={'Content-Type':'application/json','Authorization':'Bearer '+PetSecurityTests.token}
        with client.open(Request(self.base+'/api/admin/pet',data=json.dumps({'settings':{**pet.DEFAULTS,'aiEnabled':True,'maxTokens':10001}}).encode(),headers=headers)) as response:self.assertEqual(json.loads(response.read())['settings']['maxTokens'],10000)
        with client.open(self.base+'/api/pet/config') as response:self.assertNotIn('maxTokens',json.loads(response.read())['settings'])
        self.assertEqual(self.ask(client)[0],200);self.assertEqual(self.calls[0]['max_tokens'],10000)


if __name__=='__main__':unittest.main()
