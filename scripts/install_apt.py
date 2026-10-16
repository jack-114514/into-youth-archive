#!/usr/bin/env python3
"""Wait for Debian package locks; never remove lock files or stop their owners."""
import argparse
import errno
import os
from pathlib import Path
import re
import subprocess
import tempfile
import time

from install_ui import message

LOCKS = ('/var/lib/dpkg/lock-frontend', '/var/lib/dpkg/lock',
         '/var/lib/apt/lists/lock', '/var/cache/apt/archives/lock')
LOCK_ERROR = r'Could not get lock|Unable to acquire.*lock|Could not lock|Waiting for cache lock'


def package_manager_busy():
    import fcntl
    for name in LOCKS:
        try:
            # Existing files only. Acquired probe locks are released immediately on close.
            with open(name, 'r+') as stream:
                try:
                    fcntl.lockf(stream, fcntl.LOCK_EX | fcntl.LOCK_NB)
                except OSError as error:
                    if error.errno in (errno.EACCES, errno.EAGAIN):
                        return True
                    raise
        except FileNotFoundError:
            pass
    return False


def wait_for_packages(deadline, busy=package_manager_busy):
    while busy():
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            print(message('等待系统软件任务超时。配置已保留，请待系统更新完成后继续安装。',
                          'Timed out waiting for system package tasks. Configuration retained; resume after system updates finish.'), flush=True)
            return False
        print(message(f'系统软件任务正在运行，正在等待安装锁释放（最多再等 {int(remaining)} 秒）……',
                      f'Waiting for system package tasks to release the install lock (up to {int(remaining)}s remaining)…'), flush=True)
        time.sleep(min(2, remaining))
    return True


def run(command, timeout=300):
    deadline = time.monotonic() + timeout
    while True:
        if not wait_for_packages(deadline):
            return 1
        # APT's own wait also covers another installer starting after our probe.
        with tempfile.TemporaryDirectory(prefix='memory-archive-apt-') as directory:
            config = Path(directory) / 'apt.conf'
            previous = os.environ.get('APT_CONFIG')
            content = Path(previous).read_text(encoding='utf-8') if previous else ''
            content += f'\nDPkg::Lock::Timeout "{max(1, int(deadline-time.monotonic()))}";\nAcquire::Retries "3";\n'
            config.write_text(content, encoding='utf-8')
            config.chmod(0o600)
            environment = {**os.environ, 'APT_CONFIG': str(config), 'DEBIAN_FRONTEND': 'noninteractive'}
            tail = ''
            process = subprocess.Popen(command, env=environment, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, errors='replace')
            try:
                for line in process.stdout:
                    print(line, end='', flush=True)
                    tail = (tail + line)[-65536:]
                status = process.wait()
            except KeyboardInterrupt:
                process.terminate()
                process.wait()
                return 130
        if status == 0 or not re.search(LOCK_ERROR, tail, re.I):
            return status
        if time.monotonic() >= deadline:
            print(message('系统软件安装锁仍被占用，已停止；请等待系统任务结束后继续安装。',
                          'The system package lock remains busy. Resume after the other package task finishes.'), flush=True)
            return status
        print(message('系统软件任务正在运行，正在等待后重试；不会删除锁文件或中断系统更新。',
                      'Waiting for system package tasks before retrying. Lock files and running updates are preserved.'), flush=True)
        time.sleep(min(2, max(0, deadline-time.monotonic())))


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('command', nargs=argparse.REMAINDER)
    args = parser.parse_args()
    command = args.command[1:] if args.command[:1] == ['--'] else args.command
    if not command:
        parser.error('missing command')
    try:
        raise SystemExit(run(command))
    except OSError:
        raise SystemExit(message('无法检查或执行系统软件安装任务。请核对root权限和磁盘空间后重试。',
                                 'Cannot inspect or run system package installation. Check root permissions and disk space.'))
