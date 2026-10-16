#!/usr/bin/env python3
"""Installer output: keep tool logs private and show translated, honest progress."""
import argparse
import os
from pathlib import Path
import re
import subprocess
import sys
import time


def message(zh, en):
    return en if os.environ.get('INSTALL_LANG') == 'en' else zh


def describe(log):
    # A tool's percentage describes that operation only, never the entire install.
    lines = log.replace('\r', '\n').splitlines()
    for line in reversed(lines[-30:]):
        percent = re.search(r'(Receiving objects|Resolving deltas|Updating files):\s*(\d+)%', line)
        if percent:
            labels = {'Receiving objects': ('接收源码', 'Receiving source'),
                      'Resolving deltas': ('整理源码', 'Resolving source'),
                      'Updating files': ('写入源码', 'Writing source')}
            zh, en = labels[percent[1]]
            return f'{message(zh, en)} {bar(int(percent[2]))}'
        size = re.search(r'(\d+(?:\.\d+)?\s*[kMG]B)\s*/\s*(\d+(?:\.\d+)?\s*[kMG]B)', line)
        if size:
            def megabytes(part):
                number, unit = re.fullmatch(r'(\d+(?:\.\d+)?)\s*([kMG])B', part).groups()
                return float(number) * {'k': .001, 'M': 1, 'G': 1000}[unit]
            total = megabytes(size[2])
            percent = min(100, int(megabytes(size[1]) * 100 / total)) if total else 0
            return message('当前镜像层下载 ', 'Current image layer download ') + size[0] + ' ' + bar(percent)
        for pattern, zh, en in (
            ('npm ci', '正在下载和安装前端依赖', 'Downloading and installing frontend dependencies'),
            ('npm run build|rendering chunks|transforming', '正在编译网页（此阶段可能较久）', 'Compiling website (this may take a while)'),
            ('pip install|Collecting |Downloading ', '正在下载后端依赖', 'Downloading backend dependencies'),
            ('extracting|unpacking', '正在解压镜像', 'Extracting image'),
            ('load metadata|pulling|Pulling|Downloading|download', '正在获取容器镜像', 'Downloading container image'),
            ('Healthy|healthy', '正在检查服务健康状态', 'Checking service health'),
        ):
            if re.search(pattern, line):
                return message(zh, en)
    return message('正在处理；尚无可计算的百分比', 'Working; percentage is not available yet')


def bar(percent):
    percent = min(100, max(0, percent))
    filled = percent // 5
    return '[' + '#' * filled + '-' * (20 - filled) + f'] {percent}%'


def run(title, command, log_dir, interval=2):
    log_dir.mkdir(parents=True, exist_ok=True, mode=0o700)
    log = log_dir / f'{time.time_ns()}.log'
    fd = os.open(log, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    started = time.monotonic()
    print(title, flush=True)
    try:
        with os.fdopen(fd, 'wb') as stream:
            process = subprocess.Popen(command, stdout=stream, stderr=subprocess.STDOUT)
            while True:
                try:
                    status = process.wait(timeout=interval)
                    break
                except subprocess.TimeoutExpired:
                    with log.open('rb') as reader:
                        reader.seek(max(0, log.stat().st_size - 16000))
                        state = describe(reader.read().decode('utf-8', errors='replace'))
                    elapsed = int(time.monotonic() - started)
                    print(f'  {message("已用", "Elapsed")} {elapsed}s | {state}', flush=True)
    except KeyboardInterrupt:
        # The terminal also delivers SIGINT to the child process group.
        if 'process' in locals():
            process.terminate()
            process.wait()
        print(message('安装已中断。日志保存在：', 'Installation interrupted. Log: ') + str(log), flush=True)
        return 130
    except OSError as error:
        print(message('无法执行此步骤：', 'Cannot run this step: ') + str(error), file=sys.stderr)
        return 1
    elapsed = int(time.monotonic() - started)
    if status:
        contents = log.read_text(encoding='utf-8', errors='replace')
        print(message('此步骤失败。详细日志：', 'Step failed. Detailed log: ') + str(log), file=sys.stderr)
        if re.search(r'Killed|exit code: 137|out of memory|ENOMEM|heap out of memory', contents, re.I):
            print(message('编译进程被终止或内存不足。请检查系统内存/交换空间及容器限制，再重试安装。',
                          'Build was killed or ran out of memory. Check RAM, swap and container limits, then retry.'), file=sys.stderr)
        else:
            print(message('请在服务器本地查看日志；下载失败时检查网络，原有数据已保留。',
                          'Inspect the log locally; check network access for download failures. Existing data is preserved.'), file=sys.stderr)
        return status if 0 < status < 126 else 1
    print(f'  {message("完成，用时", "Done in")} {elapsed}s', flush=True)
    return 0


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--title', required=True)
    parser.add_argument('command', nargs=argparse.REMAINDER)
    args = parser.parse_args()
    command = args.command[1:] if args.command[:1] == ['--'] else args.command
    if not command:
        parser.error('missing command')
    raise SystemExit(run(args.title, command, Path(os.environ['INSTALL_LOG_DIR'])))
