"""Server-enforced administrator login throttling and escalation."""
import hashlib
import threading
import time
from collections import defaultdict, deque

try:
    import mobile_turnstile
except ModuleNotFoundError:
    from server import mobile_turnstile

_lock = threading.Lock()
_attempts = defaultdict(deque)


def client_ip(handler):
    peer = handler.client_address[0]
    # Only the local reverse proxy may supply the normalized client address.
    return handler.headers.get("X-Real-IP", peer) if peer in {"127.0.0.1", "::1"} else peer


def allow_attempt(handler, scope, limit=10, window=300):
    key = scope + ':' + hashlib.sha256(client_ip(handler).encode()).hexdigest()
    now = time.monotonic()
    with _lock:
        bucket = _attempts[key]
        while bucket and bucket[0] <= now - window:
            bucket.popleft()
        if len(bucket) >= limit:
            return False
        bucket.append(now)
        if len(_attempts) > 4096:
            for candidate in list(_attempts)[:512]:
                if not _attempts[candidate] or _attempts[candidate][-1] <= now - window:
                    del _attempts[candidate]
    return True


def _ensure_table(connection):
    connection.execute('CREATE TABLE IF NOT EXISTS admin_login_guard (scope TEXT PRIMARY KEY, failures INTEGER NOT NULL, expires_at INTEGER NOT NULL)')


def web_required(db):
    with db() as connection:
        _ensure_table(connection)
        row = connection.execute("SELECT failures FROM admin_login_guard WHERE scope='web' AND expires_at>?", (int(time.time()),)).fetchone()
        return bool(row and row[0] >= 2)


def web_before_login(handler, data, db):
    if not allow_attempt(handler, 'web-login'):
        handler.send_json(429, {"error": "登录尝试过于频繁，请等待 5 分钟后重试", "captcha_required": web_required(db)})
        return False
    # Reserve the attempt atomically, so concurrent requests cannot all use the
    # first two attempts. State survives backend restarts and browser refreshes.
    with db() as connection:
        _ensure_table(connection)
        connection.execute('BEGIN IMMEDIATE')
        row = connection.execute("SELECT failures FROM admin_login_guard WHERE scope='web' AND expires_at>?", (int(time.time()),)).fetchone()
        failures = row[0] if row else 0
        connection.execute("INSERT INTO admin_login_guard VALUES('web',?,?) ON CONFLICT(scope) DO UPDATE SET failures=excluded.failures,expires_at=excluded.expires_at", (min(failures + 1, 3), int(time.time()) + 1800))
    if failures < 2:
        return True
    try:
        verified = mobile_turnstile.verify(data.get('turnstile_token'), client_ip(handler), action='admin_login')
    except RuntimeError:
        handler.send_json(503, {"error": "登录人机验证尚未配置，请联系管理员", "captcha_required": True})
        return False
    except (OSError, ValueError):
        handler.send_json(502, {"error": "人机验证服务暂时不可用，请重新验证", "captcha_required": True})
        return False
    if not verified:
        handler.send_json(403, {"error": "密码已连续输错两次，请先完成 Cloudflare 人机验证", "captcha_required": True})
    return verified


def web_success(db):
    with db() as connection:
        _ensure_table(connection)
        connection.execute("DELETE FROM admin_login_guard WHERE scope='web'")
        connection.execute("DELETE FROM sessions WHERE expires_at<?", (int(time.time()),))
