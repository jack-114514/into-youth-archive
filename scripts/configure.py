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
from install_ui import message

ROOT = Path(__file__).resolve().parent.parent
FIELDS = ("DOMAIN", "ACME_EMAIL", "HTTP_PORT", "HTTPS_PORT", "ADMIN_USERNAME", "ADMIN_PASSWORD",
          "SEED_DEMO_CONTENT", "TURNSTILE_SITE_KEY", "TURNSTILE_SECRET_KEY", "TURNSTILE_ALLOWED_HOSTNAMES",
          "PASSWORD_CODE_PEPPER", "SMTP_HOST", "SMTP_PORT", "SMTP_SECURITY", "SMTP_USERNAME", "SMTP_PASSWORD", "SMTP_FROM")
def quote(value):
    if any(ord(c) < 32 for c in value):
        raise ValueError(message('配置值不能包含换行或控制字符', 'Configuration cannot contain control characters'))
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
        raise ValueError(message('域名须为裸域名或子域名，不包含 https://、端口、路径或通配符', 'Use a domain or subdomain without https://, ports, paths or wildcards'))
    for key in ('ACME_EMAIL', 'ADMIN_USERNAME'):
        if not re.fullmatch(r'[^\s@]+@[^\s@]+\.[^\s@]+', values.get(key, '')):
            raise ValueError(message('请填写有效的联系邮箱和管理员邮箱', 'Enter valid contact and administrator email addresses'))
    if len(values.get('ADMIN_PASSWORD', '')) < 12: raise ValueError(message('管理员密码至少 12 位', 'Admin password must have at least 12 characters'))
    if len(values.get('PASSWORD_CODE_PEPPER', '')) < 32: raise ValueError(message('内部验证码密钥至少 32 位', 'Internal recovery key must have at least 32 characters'))
    for key in ('HTTP_PORT', 'HTTPS_PORT', 'SMTP_PORT'):
        if not values.get(key, '').isdigit() or not 1 <= int(values[key]) <= 65535: raise ValueError(message('端口应为1至65535之间的整数', 'Port must be an integer between 1 and 65535'))
    if values.get('SMTP_SECURITY') not in ('ssl', 'starttls'): raise ValueError(message('邮件加密方式只支持 ssl 或 starttls', 'Mail encryption must be ssl or starttls'))
    if values.get('SMTP_HOST'):
        host = values['SMTP_HOST']
        if not re.fullmatch(r'[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?', host):
            raise ValueError(message('邮件服务器地址应类似 smtp.example.com，不能填邮箱或网址',
                                     'Mail server must look like smtp.example.com, not an email or URL'))
        for key in ('SMTP_USERNAME', 'SMTP_PASSWORD', 'SMTP_FROM'):
            if not values.get(key):
                raise ValueError(message('启用邮件发送需要完整填写账号、授权码和发信邮箱',
                                         'Mail delivery requires a username, authorization code/password and sender email'))
        if not re.fullmatch(r'[^\s@]+@[^\s@]+\.[^\s@]+', values['SMTP_FROM']):
            raise ValueError(message('发信邮箱格式无效', 'Invalid sender email'))
    if bool(values.get('TURNSTILE_SITE_KEY')) != bool(values.get('TURNSTILE_SECRET_KEY')):
        raise ValueError(message('真人验证的公开密钥和私密密钥必须同时填写或同时留空', 'Turnstile public and secret keys must both be provided or both left empty'))
    hosts = values.get('TURNSTILE_ALLOWED_HOSTNAMES', '').split(',')
    if values.get('TURNSTILE_SITE_KEY') and (domain not in hosts or any(not re.fullmatch(r'[a-z0-9.-]+', h) for h in hosts)):
        raise ValueError(message('真人验证允许的域名应包含本站域名', 'Turnstile allowed hostnames must include this website domain'))
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
    parser.add_argument('--lang', choices=('zh', 'en'), default=os.environ.get('INSTALL_LANG', 'zh'))
    args = parser.parse_args(); path = ROOT / '.env'
    os.environ['INSTALL_LANG'] = args.lang
    if path.exists() and not args.edit: raise SystemExit(message('配置已存在；请用 --edit 修改，避免覆盖已有站点', 'Configuration exists. Use --edit to change it.'))
    old = read_env(path)
    values = {'HTTP_PORT':'80', 'HTTPS_PORT':'443', 'SMTP_PORT':'465', 'SMTP_SECURITY':'ssl', 'SEED_DEMO_CONTENT':'1', **old}
    def ask(key, label, default='', private=False, check=None):
        current = values.get(key, default)
        if args.non_interactive: values[key] = os.environ.get(key, current); return
        suffix = message('（已配置，回车保留）', ' (configured, Enter to keep)') if private and current else f' [{current}]' if current else ''
        while True:
            answer = (getpass.getpass if private else input)(label + suffix + ': ').strip() or current
            if check and not check(answer):
                print(message('格式不正确，请按示例重新填写。', 'Invalid format. Please follow the example and try again.'))
                continue
            values[key] = answer
            return
    email = lambda value: re.fullmatch(r'[^\s@]+@[^\s@]+\.[^\s@]+', value)
    domain = lambda value: re.fullmatch(r'(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}', value.lower())
    def yes(zh, en):
        while True:
            answer = input(message(zh, en) + message(' [y/N，回车跳过]: ', ' [y/N, Enter to skip]: ')).strip().lower()
            if answer in ('', 'n', 'no'): return False
            if answer in ('y', 'yes'): return True
            print(message('请输入 y 或 n；回车使用默认值。', 'Enter y or n; Enter accepts the default.'))
    print(message('只需填写域名、邮箱；其余选项可直接回车。', 'Enter your domain and email. Press Enter for the other defaults.'))
    ask('DOMAIN', message('网站域名（例如 photos.example.com，不加 https://）', 'Website domain (e.g. photos.example.com, without https://)'), check=domain)
    values['DOMAIN'] = values['DOMAIN'].lower()
    ask('ACME_EMAIL', message('你的邮箱（默认同时用于后台登录和证书通知）', 'Your email (used for admin login and certificate notices)'), check=email)
    values.setdefault('ADMIN_USERNAME', values['ACME_EMAIL'])
    if not args.edit:
        ask('ADMIN_PASSWORD', message('后台密码（回车自动生成；自己填写需至少12位，输入时不显示）',
                                      'Admin password (Enter to generate; at least 12 characters if supplied, input hidden)'),
            private=True, check=lambda value: not value or len(value) >= 12)
    values['ADMIN_PASSWORD'] = values.get('ADMIN_PASSWORD') or secrets.token_urlsafe(24)
    values['PASSWORD_CODE_PEPPER'] = values.get('PASSWORD_CODE_PEPPER') or secrets.token_urlsafe(48)
    if old.get('DOMAIN') != values['DOMAIN']: values['TURNSTILE_ALLOWED_HOSTNAMES'] = values['DOMAIN']
    values.setdefault('TURNSTILE_ALLOWED_HOSTNAMES', values['DOMAIN'])
    print(message('配置方式：1 基础设置（推荐，回车）  2 高级设置', 'Setup mode: 1 Basic (recommended, Enter)  2 Advanced'))
    mode = '1'
    if not args.non_interactive:
        while True:
            mode = input(message('选择 [1]: ', 'Choose [1]: ')).strip() or '1'
            if mode in ('1', '2'): break
            print(message('请输入 1 或 2。', 'Enter 1 or 2.'))
    if mode == '2':
        ask('ADMIN_USERNAME', message('后台登录邮箱（回车使用上面的邮箱）', 'Admin login email (Enter to keep default)'), check=email)
        print(message('真人验证：通过 Cloudflare 判断是否由真人操作；邮箱找回密码需要它。已有配置回车保留。',
                      'Human verification: Cloudflare Turnstile is needed for email password recovery. Existing values are preserved.'))
        if yes('配置真人验证？', 'Configure human verification?'):
            ask('TURNSTILE_SITE_KEY', message('验证组件公开密钥（Cloudflare 中的 Site Key）', 'Turnstile Site Key'))
            ask('TURNSTILE_SECRET_KEY', message('验证组件私密密钥（Cloudflare 中的 Secret Key）', 'Turnstile Secret Key'), private=True)
        print(message('邮件发送：让网站通过你的邮箱发送找回密码邮件。已有配置回车保留。',
                      'Mail delivery: send password recovery emails through your mail provider. Existing values are preserved.'))
        if yes('配置邮件发送？', 'Configure mail delivery?'):
            ask('SMTP_HOST', message('邮件服务器地址（例如 smtp.example.com，不能填邮箱）', 'Mail server hostname (e.g. smtp.example.com, not your email)'),
                check=lambda value: re.fullmatch(r'[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?', value))
            ask('SMTP_PORT', message('邮件端口（服务商未指定时回车用465）', 'Mail port (Enter for 465)'), check=lambda value: value.isdigit() and 1 <= int(value) <= 65535)
            ask('SMTP_SECURITY', message('邮件加密（465通常填ssl；587通常填starttls）', 'Mail encryption (usually ssl for 465, starttls for 587)'), check=lambda value: value in ('ssl', 'starttls'))
            ask('SMTP_USERNAME', message('发信账号（通常是完整邮箱）', 'Mail username (usually full email)'), check=bool)
            ask('SMTP_PASSWORD', message('邮箱授权码（在邮箱服务商处获取，通常不是登录密码）', 'Mail authorization code / SMTP password'), private=True, check=bool)
            ask('SMTP_FROM', message('发信邮箱', 'Sender email'), values.get('SMTP_USERNAME', ''), check=email)
    if args.non_interactive:
        values.update({key: os.environ[key] for key in FIELDS if key in os.environ})
    validate(values)
    if path.exists():
        directory = ROOT/'backups'/datetime.now().strftime('%Y%m%d-%H%M%S-%f'); directory.mkdir(parents=True, mode=0o700)
        shutil.copy2(path, directory/'config.env'); (directory/'config.env').chmod(0o600)
    write_env(path, values)
    print(message('配置已保存至本地 .env（仅所有者可读写）。安装成功后会在当前终端显示初始登录信息。',
                  'Configuration saved to local .env (owner only). Initial login details appear in the terminal after installation.'))
    if not values.get('SMTP_HOST') or not values.get('TURNSTILE_SITE_KEY'):
        print(message('邮箱找回密码暂未启用；网站和后台可正常使用。以后可运行 bash scripts/reconfigure.sh 配置。',
                      'Email password recovery is not enabled. Website and admin login work. Configure later with bash scripts/reconfigure.sh.'))
if __name__ == '__main__':
    try: main()
    except ValueError as error: raise SystemExit(str(error))
