"""Cloudflare challenge for native administrator password login."""
import json
import os
import hashlib
import hmac
import re
import secrets
import time
from urllib.parse import urlencode, parse_qs, urlparse
from urllib.request import Request, urlopen

ACTION = "admin_app_login"
BROWSER_PENDING_TTL = 600
BROWSER_VERIFIED_TTL = 300


def ensure_browser_table(connection):
    connection.execute('''CREATE TABLE IF NOT EXISTS admin_browser_challenges (
        id TEXT PRIMARY KEY, secret_hash TEXT NOT NULL,
        state TEXT NOT NULL CHECK(state IN ('pending','verified','used')),
        expires_at INTEGER NOT NULL)''')


def valid_flow_id(value):
    return isinstance(value, str) and re.fullmatch(r'[0-9a-f]{48}', value) is not None


def create_browser_challenge(connection):
    configuration()
    ensure_browser_table(connection)
    connection.execute('DELETE FROM admin_browser_challenges WHERE expires_at < ?', (int(time.time()),))
    flow_id, secret = secrets.token_hex(24), secrets.token_hex(32)
    connection.execute('INSERT INTO admin_browser_challenges VALUES(?,?,?,?)',
                       (flow_id, hashlib.sha256(secret.encode()).hexdigest(), 'pending', int(time.time()) + BROWSER_PENDING_TTL))
    return {'id': flow_id, 'secret': secret,
            'url': '/api/v1/admin-app/auth/challenge?flow=' + flow_id,
            'expires_in': BROWSER_PENDING_TTL}


def browser_state(connection, flow_id, secret):
    ensure_browser_table(connection)
    if not valid_flow_id(flow_id) or not isinstance(secret, str) or re.fullmatch(r'[0-9a-f]{64}', secret) is None:
        return None
    row = connection.execute('SELECT * FROM admin_browser_challenges WHERE id=?', (flow_id,)).fetchone()
    if row is None or not hmac.compare_digest(row['secret_hash'], hashlib.sha256(secret.encode()).hexdigest()):
        return None
    return 'expired' if row['expires_at'] <= int(time.time()) else row['state']


def complete_browser_challenge(connection, flow_id, token, remote_ip):
    ensure_browser_table(connection)
    if not valid_flow_id(flow_id):
        return False
    row = connection.execute('SELECT state,expires_at FROM admin_browser_challenges WHERE id=?', (flow_id,)).fetchone()
    if row is None or row['state'] != 'pending' or row['expires_at'] <= int(time.time()):
        return False
    if not verify(token, remote_ip):
        return False
    now = int(time.time())
    return connection.execute(
        "UPDATE admin_browser_challenges SET state='verified',expires_at=? WHERE id=? AND state='pending' AND expires_at>?",
        (now + BROWSER_VERIFIED_TTL, flow_id, now),
    ).rowcount == 1


def consume_browser_challenge(connection, data):
    if 'challenge_id' not in data and 'challenge_secret' not in data:
        return None  # Older clients still submit a genuine Turnstile token.
    configuration()
    flow_id, secret = data.get('challenge_id'), data.get('challenge_secret')
    if browser_state(connection, flow_id, secret) != 'verified':
        return False
    # Atomic claim: one verified challenge permits exactly one password attempt.
    return connection.execute(
        "UPDATE admin_browser_challenges SET state='used' WHERE id=? AND state='verified' AND expires_at>? AND secret_hash=?",
        (flow_id, int(time.time()), hashlib.sha256(secret.encode()).hexdigest()),
    ).rowcount == 1


def configuration():
    sitekey = os.environ.get("TURNSTILE_SITE_KEY", "").strip()
    secret = os.environ.get("TURNSTILE_SECRET_KEY", "").strip()
    hosts = {v.strip().lower() for v in os.environ.get("TURNSTILE_ALLOWED_HOSTNAMES", "").split(",") if v.strip()}
    if not sitekey or not secret or not hosts:
        raise RuntimeError("登录人机验证尚未配置，请联系管理员")
    return sitekey, secret, hosts


def verify(token, remote_ip, action=ACTION):
    _, secret, hosts = configuration()
    if not isinstance(token, str) or not token.strip() or len(token) > 2048:
        return False
    payload = urlencode({"secret": secret, "response": token, "remoteip": remote_ip}).encode()
    request = Request("https://challenges.cloudflare.com/turnstile/v0/siteverify", data=payload,
                      headers={"Content-Type": "application/x-www-form-urlencoded"}, method="POST")
    with urlopen(request, timeout=12) as response:
        result = json.loads(response.read().decode())
    return (isinstance(result, dict) and result.get("success") is True
            and result.get("action") == action
            and str(result.get("hostname", "")).lower() in hosts)


def challenge_page(handler):
    sitekey, _, _ = configuration()
    flow_id = parse_qs(urlparse(handler.path).query).get('flow', [None])[0]
    inline = parse_qs(urlparse(handler.path).query).get('inline', [''])[0] == '1'
    if flow_id is not None and not valid_flow_id(flow_id):
        return handler.send_json(400, {'error': {'message': '验证会话无效，请返回 App 重新验证'}})
    # Only a public sitekey is rendered. Credentials never enter this page.
    page = '''<!doctype html><html lang="zh-CN"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>登录人机验证</title><style>body{font:16px sans-serif;background:#e8f3ea;color:#103534;margin:24px}
#status{line-height:1.6}button{padding:12px;margin-top:16px}INLINE_STYLE</style></head><body>
<p id="heading">请完成 Cloudflare 人机验证</p><div id="challenge"></div><p id="status">正在加载验证…</p>
<button id="retry" onclick="location.reload()">重新验证</button><script>
const flow=FLOWID;
function message(type,token,code,height){if(window.IntoTurnstile)IntoTurnstile.postMessage(JSON.stringify({type:type,flow:flow,token:token||'',code:code||'',height:height||0}));}
function resized(){message('resize','','',Math.ceil(document.body.scrollHeight));}
if(window.ResizeObserver)new ResizeObserver(resized).observe(document.body);
async function accepted(token){
  if(!flow){document.getElementById('status').textContent='验证完成，正在返回登录';message('success',token);return;}
  document.getElementById('status').textContent='正在确认验证结果…';
  try{
    const response=await fetch('/api/v1/admin-app/auth/challenge/complete',{method:'POST',credentials:'omit',cache:'no-store',
      headers:{'Content-Type':'application/json'},body:JSON.stringify({challenge_id:flow,turnstile_token:token})});
    const result=await response.json();
    if(!response.ok)throw new Error(result.error?.message||'验证未通过，请重试');
    document.getElementById('status').textContent='验证已通过，请返回 App，应用会自动继续登录。';
    message('success');
  }catch(error){document.getElementById('status').textContent=error.message||'确认失败，请重新验证';message('error','','confirm');}
}
function scriptFailed(){document.getElementById('status').textContent='无法连接 Cloudflare，请检查网络后重试';message('error','','script-load');}
function ready(){turnstile.render('#challenge',{sitekey:SITEKEY,action:'admin_app_login',language:'zh-cn',size:'flexible',retry:'never',
callback:accepted,
'expired-callback':function(){message('expired');document.getElementById('status').textContent='验证已过期，请重新验证';},
'error-callback':function(code){message('error','',code);document.getElementById('status').textContent='Cloudflare 验证未完成（错误码 '+code+'），请重试或切换网络';return true;}});}
</script><script src="https://challenges.cloudflare.com/turnstile/v0/api.js?onload=ready&amp;render=explicit" onerror="scriptFailed()" async defer></script>
</body></html>'''.replace('SITEKEY', json.dumps(sitekey).replace('<', '\\u003c')).replace('FLOWID', json.dumps(flow_id))
    if inline:
        page = page.replace('INLINE_STYLE', 'html,body{margin:0;padding:0;background:transparent}body{font-size:13px}#heading,#retry{display:none}#status{margin:8px 2px}')
        page = page.replace('验证已通过，请返回 App，应用会自动继续登录。', '人机验证已通过，可以安全登录')
    else:
        page = page.replace('INLINE_STYLE', '')
    data = page.encode()
    handler.send_response(200)
    handler.send_header("Content-Type", "text/html; charset=utf-8")
    handler.send_header("Content-Length", str(len(data)))
    handler.send_header("Cache-Control", "no-store")
    handler.send_header("X-Content-Type-Options", "nosniff")
    handler.send_header("Referrer-Policy", "no-referrer")
    handler.end_headers()
    handler.wfile.write(data)
