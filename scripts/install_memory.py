#!/usr/bin/env python3
"""Check build capacity; only add dedicated swap after an explicit choice."""
import math
import os
from pathlib import Path
import shutil
import stat
import subprocess

from install_ui import message

MIB = 1024 * 1024
SWAP = Path('/var/lib/memory-archive/install.swap')


def read_memory(path=Path('/proc/meminfo')):
    return {line.split(':')[0]: int(line.split()[1]) // 1024
            for line in path.read_text().splitlines() if len(line.split()) >= 2}


def swap_size(info):
    budget = info.get('MemAvailable', 0) + info.get('SwapFree', 0)
    return max(2048, math.ceil((3072 - budget) / 1024) * 1024) if budget < 2304 else 0


def cgroup_limit():
    for path in (Path('/sys/fs/cgroup/memory.max'), Path('/sys/fs/cgroup/memory/memory.limit_in_bytes')):
        try:
            value = path.read_text().strip()
            if value.isdigit() and int(value) < 2 * 1024 * MIB:
                return int(value) // MIB
        except OSError:
            pass
    return None


def main():
    limit = cgroup_limit()
    if limit is not None:
        raise SystemExit(message(f'容器内存上限仅 {limit}MB，请在服务商控制台提高到至少 2GB 后重试。',
                                 f'Container memory limit is {limit}MB. Raise it to at least 2GB before retrying.'))
    info = read_memory()
    print(message(f'内存共 {info["MemTotal"]}MB，可用 {info.get("MemAvailable", 0)}MB；可用交换空间 {info.get("SwapFree", 0)}MB。',
                  f'RAM: {info["MemTotal"]}MB total, {info.get("MemAvailable", 0)}MB available; free swap: {info.get("SwapFree", 0)}MB.'))
    required = swap_size(info)
    if not required:
        return
    print(message(f'编译可能因内存不足而中断。可增加 {required // 1024}GB 辅助内存（交换文件，占用同等磁盘空间，速度比内存慢）。',
                  f'The build may run out of memory. Add {required // 1024}GB of swap (uses disk space and is slower than RAM).'))
    print(message('只用于当前开机期间；不修改系统开机配置，文件会保留以便下次复用。',
                  'Active until reboot only. Startup configuration is unchanged; the file is retained for reuse.'))
    if os.environ.get('INSTALL_NON_INTERACTIVE') == '1':
        raise SystemExit(message('非交互安装已停止，请先手动准备足够内存/交换空间。',
                                 'Unattended install stopped. Prepare sufficient RAM/swap first.'))
    choice = input(message('是否增加辅助内存？[Y/n，回车同意]: ', 'Add swap? [Y/n, Enter=yes]: ')).strip().lower()
    while choice not in ('', 'y', 'yes', 'n', 'no'):
        choice = input(message('请输入 y 或 n: ', 'Enter y or n: ')).strip().lower()
    if choice in ('n', 'no'):
        raise SystemExit(message('已停止，配置保留。升级内存后重新运行安装命令。',
                                 'Stopped; configuration retained. Upgrade RAM and rerun the installer.'))
    if not all(shutil.which(cmd) for cmd in ('mkswap', 'swapon')):
        raise SystemExit(message('系统缺少交换空间工具，请安装 util-linux 后重试。', 'Install util-linux for mkswap/swapon, then retry.'))
    if SWAP.parent.is_symlink():
        raise SystemExit(message('交换文件目录是链接，已停止。请手动准备交换空间。', 'Swap directory is a symlink. Prepare swap manually.'))
    SWAP.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    directory = SWAP.parent.stat()
    if directory.st_uid != 0 or directory.st_mode & 0o022:
        raise SystemExit(message('交换文件目录权限不安全，请手动准备交换空间。', 'Unsafe swap directory permissions. Prepare swap manually.'))
    if SWAP.exists() or SWAP.is_symlink():
        existing = SWAP.lstat()
        if not stat.S_ISREG(existing.st_mode) or existing.st_uid != 0 or existing.st_nlink != 1 or existing.st_mode & 0o077:
            raise SystemExit(message('现有交换文件属性不安全，已停止且未覆盖文件。', 'Unsafe existing swap file; stopped without overwriting.'))
        if existing.st_size < required * MIB:
            raise SystemExit(message('已有交换文件容量不足；请手动增加交换空间，原文件保持不变。',
                                     'Existing swap file is too small; add swap manually. File is unchanged.'))
    else:
        if shutil.disk_usage(SWAP.parent).free < (required + 1024) * MIB:
            raise SystemExit(message('磁盘空间不足，需在交换文件之外至少剩余 1GB。请扩容后重试。',
                                     'Not enough disk space. Keep at least 1GB free in addition to the swap file.'))
        print(message('正在准备辅助内存，请稍候……', 'Preparing swap, please wait…'), flush=True)
        fd = os.open(SWAP, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        # Write actual blocks: sparse files are not accepted by swapon.
        with os.fdopen(fd, 'wb') as stream:
            block = bytes(MIB)
            for index in range(required):
                stream.write(block)
                if (index + 1) % 256 == 0:
                    print(f'  {message("准备交换文件", "Preparing swap file")} {(index + 1) * 100 // required}%', flush=True)
        subprocess.run(['mkswap', str(SWAP)], check=True, stdout=subprocess.DEVNULL)
    try:
        subprocess.run(['swapon', str(SWAP)], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
    except subprocess.CalledProcessError:
        raise SystemExit(message('服务器不允许启用此交换文件。请在服务商控制台增加内存或联系服务商；配置和文件均保留。',
                                 'The server cannot enable this swap file. Upgrade RAM or contact your provider. Configuration and file retained.'))
    print(message('辅助内存已启用。编译仍可能耗时，请耐心等待。', 'Swap enabled. Compilation may still take time.'))


if __name__ == '__main__':
    try:
        main()
    except (OSError, subprocess.CalledProcessError):
        raise SystemExit(message('辅助内存准备失败，可能是权限、文件系统或磁盘空间限制。配置已保留，请处理后重试。',
                                 'Swap preparation failed: check permissions, filesystem support and disk space. Configuration retained; resolve and retry.'))
