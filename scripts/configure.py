#!/usr/bin/env python3
"""Interactive owner configuration. Secrets stay in a local 0600 .env file."""
import argparse
import getpass
import os
from pathlib import Path
import re
import secrets
import shutil
from datetime import datetime

ROOT = Path(__file__).resolve().parent.parent
FIELDS = ("DOMAIN", "ACME_EMAIL", "HTTP_PORT", "HTTPS_PORT", "ADMIN_USERNAME", "ADMIN_PASSWORD",
          "SEED_DEMO_CONTENT", "TURNSTILE_SITE_KEY", "TURNSTILE_SECRET_KEY", "TURNSTILE_ALLOWED_HOSTNAMES",
          "PASSWORD_CODE_PEPPER", "SMTP_HOST", "SMTP_PORT", "SMTP_SECURITY", "SMTP_USERNAME", "SMTP_PASSWORD", "SMTP_FROM")
def quote(value):
    if any(ord(c) < 32 for c in value):
        raise ValueError("配置值不能包含换行或控制字符")
    return "'" + value.replace("'", "\\'") + "'"
def read_env(path):
    values = {}
    if not path.exists(): return values
    for line in path.read_text(encoding="utf-8").splitlines():
        if not line or line.startswith('#'): continue
        key, sep, value = line.partition('=')
        if not sep or key not in FIELDS: continue
        if value.startswith("'") and value.endswith("'"):
            value = value[1:-1].replace("\\'", "'")
        values[key] = value
    return values
def validate(values):
    domain = values.get('DOMAIN', '').lower()
    if not re.fullmatch(r'(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}', domain):
        raise ValueError('域名须为裸域名或子域名，不包含 https://、端口、路径或通配符')
    for key in ('ACME_EMAIL', 'ADMIN_USERNAME'):
        if not re.fullmatch(r'[^\s@]+@[^\s@]+\.[^\s@]+', values.get(key, '')):
            raise ValueError(f'{key} 须为自己的有效邮箱')
    if len(values.get('ADMIN_PASSWORD', '')) < 12: raise ValueError('管理员密码至少 12 位')
    if len(values.get('PASSWORD_CODE_PEPPER', '')) < 32: raise ValueError('验证码密钥至少 32 位')
    for key in ('HTTP_PORT', 'HTTPS_PORT', 'SMTP_PORT'):
        if not values.get(key, '').isdigit() or not 1 <= int(values[key]) <= 65535: raise ValueError(f'{key} 端口无效')
    if values.get('SMTP_SECURITY') not in ('ssl', 'starttls'): raise ValueError('SMTP_SECURITY 只支持 ssl 或 starttls')
    if bool(values.get('TURNSTILE_SITE_KEY')) != bool(values.get('TURNSTILE_SECRET_KEY')):
        raise ValueError('Turnstile Site Key 和 Secret Key 必须同时填写或同时留空')
    hosts = values.get('TURNSTILE_ALLOWED_HOSTNAMES', '').split(',')
    if values.get('TURNSTILE_SITE_KEY') and (domain not in hosts or any(not re.fullmatch(r'[a-z0-9.-]+', h) for h in hosts)):
        raise ValueError('Turnstile 允许的域名应包含本站域名')
    for value in values.values(): quote(value)
def write_env(path, values):
    validate(values)
    temporary = path.with_suffix('.new')
    fd = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, 'w', encoding='utf-8', newline='\n') as stream:
        stream.write('# Local site configuration. Do not commit or share.\n')
        for key in FIELDS: stream.write(f'{key}={quote(values.get(key, ""))}\n')
    os.replace(temporary, path)
    path.chmod(0o600)
def main():
    parser = argparse.ArgumentParser(); parser.add_argument('--edit', action='store_true'); parser.add_argument('--non-interactive', action='store_true')
    args = parser.parse_args(); path = ROOT / '.env'
    if path.exists() and not args.edit: raise SystemExit('配置已存在；请用 --edit 修改，避免覆盖已有站点')
    old = read_env(path)
    values = {'HTTP_PORT':'80', 'HTTPS_PORT':'443', 'SMTP_PORT':'465', 'SMTP_SECURITY':'ssl', 'SEED_DEMO_CONTENT':'1', **old}
    def ask(key, label, default='', private=False):
        current = values.get(key, default)
        if args.non_interactive: values[key] = os.environ.get(key, current); return
        suffix = '（已配置，回车保留）' if private and current else f' [{current}]' if current else ''
        answer = (getpass.getpass if private else input)(label + suffix + ': ').strip()
        values[key] = answer or current
    ask('DOMAIN', '自己的域名（如 photos.your-domain.com）')
    values['DOMAIN'] = values['DOMAIN'].lower()
    ask('ACME_EMAIL', '证书联系邮箱')
    ask('ADMIN_USERNAME', '管理员登录及恢复邮箱', values['ACME_EMAIL'])
    if not args.edit: ask('ADMIN_PASSWORD', '管理员密码（至少12位；留空生成随机密码）', private=True)
    values['ADMIN_PASSWORD'] = values.get('ADMIN_PASSWORD') or secrets.token_urlsafe(24)
    values['PASSWORD_CODE_PEPPER'] = values.get('PASSWORD_CODE_PEPPER') or secrets.token_urlsafe(48)
    ask('TURNSTILE_SITE_KEY', '自己的 Cloudflare Turnstile Site Key（可选）')
    ask('TURNSTILE_SECRET_KEY', '自己的 Cloudflare Turnstile Secret Key（可选）', private=True)
    if old.get('DOMAIN') != values['DOMAIN']: values['TURNSTILE_ALLOWED_HOSTNAMES'] = values['DOMAIN']
    values.setdefault('TURNSTILE_ALLOWED_HOSTNAMES', values['DOMAIN'])
    ask('SMTP_HOST', '自己的 SMTP 服务器（可选，留空不启用邮箱恢复）')
    if values.get('SMTP_HOST'):
        ask('SMTP_PORT', 'SMTP 端口'); ask('SMTP_SECURITY', 'SMTP 加密方式 ssl/starttls')
        ask('SMTP_USERNAME', 'SMTP 账号'); ask('SMTP_PASSWORD', 'SMTP 密码/授权码', private=True)
        ask('SMTP_FROM', '发信邮箱', values.get('SMTP_USERNAME', ''))
    validate(values)
    if path.exists():
        directory = ROOT/'backups'/datetime.now().strftime('%Y%m%d-%H%M%S-%f'); directory.mkdir(parents=True, mode=0o700)
        shutil.copy2(path, directory/'config.env'); (directory/'config.env').chmod(0o600)
    write_env(path, values)
    print('已保存本地 .env（0600权限）。管理员密码不会输出到日志；生成的密码请在服务器本地查看 .env。')
if __name__ == '__main__':
    try: main()
    except ValueError as error: raise SystemExit(str(error))
