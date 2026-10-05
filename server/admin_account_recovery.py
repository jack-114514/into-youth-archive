"""Native password recovery: verified human, email code, global revocation."""
import hmac
import re
import secrets
import smtplib
import sys
import time

def dispatch(handler, path, api, data, request_id):
    host = sys.modules[type(handler).__module__]
    if path.endswith('/code'):
        try:
            with api._db() as connection:
                verified = api.mobile_turnstile.consume_browser_challenge(connection, data)
            if not verified:
                verified = api.mobile_turnstile.verify(str(data.get('turnstile_token', '')), api.login_security.client_ip(handler))
        except RuntimeError:
            return api._error(handler, 503, 'verification_unavailable', '人机验证尚未配置', request_id)
        except (OSError, ValueError):
            return api._error(handler, 502, 'verification_unavailable', '人机验证暂时不可用', request_id)
        if not verified:
            return api._error(handler, 403, 'verification_required', '请先完成人机验证', request_id)
        with api._db() as connection:
            connection.execute('BEGIN IMMEDIATE')
            now = int(time.time())
            row = connection.execute('SELECT requested_at FROM password_change_codes WHERE id=1').fetchone()
            if row and now-row['requested_at'] < 60:
                return api._error(handler, 429, 'rate_limited', '请等待60秒再发送', request_id)
            admin = connection.execute('SELECT username FROM admins WHERE id=1').fetchone()
            code = f'{secrets.randbelow(1000000):06d}'
            try:
                host.send_verification_code(admin['username'], code)
            except (RuntimeError, OSError, smtplib.SMTPException):
                return api._error(handler, 503, 'mail_unavailable', '邮箱验证码发送失败，请检查站点邮件配置', request_id)
            connection.execute('INSERT INTO password_change_codes(id,code_hash,expires_at,requested_at,attempts) VALUES(1,?,?,?,0) ON CONFLICT(id) DO UPDATE SET code_hash=excluded.code_hash,expires_at=excluded.expires_at,requested_at=excluded.requested_at,attempts=0', (host.verification_code_hash(code),now+600,now))
            local, sep, domain = admin['username'].partition('@')
            masked = f'{local[:2]}***@{domain}' if sep else '管理员邮箱'
        return api._send(handler, 200, {'ok':True,'email':masked})
    password = data.get('password', '')
    code = str(data.get('code','')).strip()
    if not isinstance(password,str) or not 12 <= len(password) <= 256:
        return api._error(handler,400,'validation_error','新密码须为12到256位',request_id)
    if not re.fullmatch(r'\d{6}',code):
        return api._error(handler,400,'validation_error','请输入6位邮箱验证码',request_id)
    with api._db() as connection:
        connection.execute('BEGIN IMMEDIATE')
        row=connection.execute('SELECT * FROM password_change_codes WHERE id=1').fetchone()
        if not row or row['expires_at'] < int(time.time()):
            return api._error(handler,400,'invalid_code','验证码已过期，请重新发送',request_id)
        if row['attempts'] >= 5:
            return api._error(handler,429,'rate_limited','验证码错误次数过多，请重新发送',request_id)
        if not hmac.compare_digest(host.verification_code_hash(code),row['code_hash']):
            connection.execute('UPDATE password_change_codes SET attempts=attempts+1 WHERE id=1')
            return api._error(handler,400,'invalid_code','验证码不正确',request_id)
        salt=secrets.token_bytes(24)
        connection.execute('UPDATE admins SET salt=?,password_hash=? WHERE id=1',(salt,api._password_hash(password,salt,api.PASSWORD_ITERATIONS)))
        connection.execute('DELETE FROM password_change_codes')
        connection.execute('DELETE FROM sessions')
        connection.execute('DELETE FROM admin_app_sessions')
        api._audit(connection,'recover_password',request_id,'account')
    return api._send(handler,200,{'ok':True})
