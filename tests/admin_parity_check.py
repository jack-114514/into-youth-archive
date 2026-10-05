"""Isolated real HTTP checks, using synthetic content and credentials only."""
import gc
import json
import os
from pathlib import Path
import sys
import tempfile
import threading
from unittest.mock import patch
from urllib.request import Request, urlopen
from urllib.error import HTTPError

sys.path.insert(0,str(Path(__file__).resolve().parent.parent))

with tempfile.TemporaryDirectory() as temp:
    os.environ.update(SITE_DATA_DIR=temp+'/data',SITE_UPLOAD_DIR=temp+'/uploads',ADMIN_USERNAME='owner@example.org',ADMIN_PASSWORD='test-only-password-1234',PASSWORD_CODE_PEPPER='fixture-only-'+'x'*48,TURNSTILE_SITE_KEY='',TURNSTILE_SECRET_KEY='')
    from server import app, admin_app_api as api
    app.initialize()
    server=app.ThreadingHTTPServer(('127.0.0.1',0),app.Handler)
    thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
    origin=f'http://127.0.0.1:{server.server_port}'
    def request(path,data=None,token=None,method=None):
        headers={'Content-Type':'application/json'}
        if token: headers['Authorization']='Bearer '+token
        req=Request(origin+path,data=json.dumps(data).encode() if data is not None else None,headers=headers,method=method)
        try:
            with urlopen(req,timeout=10) as response:return response.status,json.load(response)
        except HTTPError as e:return e.code,json.load(e)
    count=0
    def check(condition,label):
        global count
        assert condition,label
        count+=1
    try:
        check(request('/api/v1/admin-app/status')[0]==401,'status requires native session')
        native=request('/api/v1/admin-app/auth/login',{'username':'owner@example.org','password':'test-only-password-1234'})[1]
        token=native['access_token']
        check('memory' in request('/api/v1/admin-app/status',token=token)[1],'native returns the website server metrics')
        native_url='/api/v1/admin-app/settings'
        changes={'home_campus_title':'Campus changed','home_notes_title':'Notes changed','home_card_aspects':json.dumps({'home_card_story_image':'4:3','unknown':'1:1'}),'home_card_crops':json.dumps({'home_card_story_image':{'left':12,'top':8,'width':70,'height':80},'unknown':{'left':0,'top':0,'width':100,'height':100}}),'music_default_volume':'73','contact_custom_links':json.dumps([{'label':'Video','url':'https://example.org/channel'}])}
        check(request(native_url,changes,token,'PATCH')[0]==200,'native changes save')
        content=request('/api/content')[1]['settings']
        check(content['home_campus_title']=='Campus changed' and content['home_notes_title']=='Notes changed','new copy fields reach public content')
        check(json.loads(content['home_card_aspects'])=={'home_card_story_image':'4:3'},'aspect normalization matches website')
        check(list(json.loads(content['home_card_crops']))==['home_card_story_image'],'crop whitelist matches website')
        check(content['music_default_volume']=='73','music volume reaches website')
        tracks=[{'id':f'track-{i}','name':'n'*80,'url':f'/uploads/{i}.mp3'} for i in range(20)]
        check(request(native_url,{'music_playlist':json.dumps(tracks)},token,'PATCH')[0]==200,'full 20 song playlist saves')
        check(len(json.loads(request(native_url,token=token)[1]['settings']['music_playlist']))==20,'playlist remains valid JSON after saving')
        before=content['site_title']
        check(request(native_url,{'site_title':'must roll back','timeline_items':'x'*12001},token,'PATCH')[0]==400,'oversize settings reject')
        check(request('/api/content')[1]['settings']['site_title']==before,'invalid patch rolls back all changes')
        media=request('/api/v1/admin-app/media',{'url':'/uploads/test.jpg','thumbnail_url':'/uploads/preview.jpg','title':'Fixture','show_in_stories':True},token)[1]
        check('id' in media,'native creates media with thumbnail')
        check(request(f"/api/v1/admin-app/media/{media['id']}",{'show_in_stories':False,'thumbnail_url':'/uploads/new.jpg'},token,'PATCH')[0]==200,'native edits media flags and thumbnail')
        row=next(v for v in request('/api/v1/admin-app/media',token=token)[1]['media'] if v['id']==media['id'])
        check(row['show_in_stories']==0 and row['thumbnail_url']=='/uploads/new.jpg' and row['url']=='/uploads/test.jpg','unchanged media fields preserved')
        intro=request('/api/v1/admin-app/homepage-intro',token=token)[1]
        intro['settings']['intro_title']='New opening';intro['nodes']=[{'title':'A','subtitle':'first','enabled':1},{'title':'B','subtitle':'second','enabled':0}]
        check(request('/api/v1/admin-app/homepage-intro',intro,token,'PATCH')[0]==200,'native opening saves')
        reread=request('/api/v1/admin-app/homepage-intro',token=token)[1]
        check(reread['settings']['intro_title']=='New opening' and len(reread['nodes'])==2 and reread['nodes'][1]['enabled']==0,'opening settings and ordered enabled nodes round trip')
        pet=request('/api/v1/admin-app/pet',token=token)[1]['settings'];pet.update(size=310,position='left');pet['lines']['click']=['New line']
        check(request('/api/v1/admin-app/pet',{'settings':pet},token,'PATCH')[0]==200,'full native pet parameters save')
        preset=request('/api/v1/admin-app/pet/presets',{'name':'Fixture preset','settings':pet},token)[1]['presets'][0]
        check(preset['settings']['lines']['click']==['New line'] and 'apiKey' not in preset,'preset keeps lines and excludes credentials')
        check(request('/api/v1/admin-app/pet/presets/delete',{'id':preset['id']},token)[0]==200,'native preset deletion works')
        check(request('/api/v1/admin-app/account/recovery/code',{})[0] in {403,503},'email recovery cannot skip human verification')
        sent=[]
        with patch('server.mobile_turnstile.verify',return_value=True),patch.object(app,'send_verification_code',side_effect=lambda email,code:sent.append(code)):
            check(request('/api/v1/admin-app/account/recovery/code',{'turnstile_token':'test-token'})[0]==200 and len(sent)==1,'verified recovery sends one synthetic email')
        check(request('/api/v1/admin-app/account/recovery/complete',{'code':'not-a-code','password':'new-test-password-1234'})[0]==400,'invalid recovery code rejected')
        check(request('/api/v1/admin-app/account/recovery/complete',{'code':sent[0],'password':'new-test-password-1234'})[0]==200,'native email recovery succeeds')
        check(request('/api/v1/admin-app/settings',token=token)[0]==401,'password recovery revokes native access')
        check(request('/api/v1/admin-app/auth/refresh',{'refresh_token':native['refresh_token']})[0]==401,'password recovery revokes native refresh')
        check(request('/api/v1/admin-app/auth/login',{'username':'owner@example.org','password':'new-test-password-1234'})[0]==200,'new password authenticates')
        print(json.dumps({'passed':count,'synthetic_data_only':True}))
    finally:
        server.shutdown();server.server_close();thread.join();gc.collect()
