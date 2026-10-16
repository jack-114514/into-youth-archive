#!/usr/bin/env python3
"""Show initial credentials only to the controlling terminal, never captured logs."""
from pathlib import Path
from configure import ROOT, read_env
from install_ui import message


def main():
    values = read_env(ROOT / '.env')
    port = values.get('HTTPS_PORT', '443')
    origin = 'https://' + values['DOMAIN'] + (':' + port if port != '443' else '')
    print(message('网站：', 'Website: ') + origin)
    print(message('后台：', 'Admin: ') + origin + '/admin')
    try:
        with Path('/dev/tty').open('w', encoding='utf-8') as terminal:
            terminal.write(message('\n请保存初始登录信息（仅在当前终端显示）：\n', '\nSave the initial login details (shown only in this terminal):\n'))
            terminal.write(message('登录邮箱：', 'Login email: ') + values['ADMIN_USERNAME'] + '\n')
            terminal.write(message('初始密码：', 'Initial password: ') + values['ADMIN_PASSWORD'] + '\n')
            terminal.write(message('已有账号更改过密码时，以更改后的密码为准。\n', 'For an existing account, use the password you last set.\n'))
    except OSError:
        print(message('没有交互终端，密码未输出。请在服务器终端运行 python3 scripts/show_login.py 查看。',
                      'No interactive terminal; password not printed. Run python3 scripts/show_login.py in your server terminal.'))


if __name__ == '__main__':
    main()
