#!/usr/bin/env python3
"""Find the latest installer log without asking users to transcribe timestamps."""
from pathlib import Path
from install_ui import message

ROOT = Path(__file__).resolve().parent.parent


def latest_log(root=ROOT, temporary=Path('/tmp')):
    pointer = root / '.install-last-log'
    if pointer.is_file() and not pointer.is_symlink():
        path = Path(pointer.read_text(encoding='utf-8').strip())
        if path.is_file() and path.suffix == '.log':
            return path
    files = [p for folder in temporary.glob('memory-archive-install.*') if folder.is_dir()
             for p in folder.glob('*.log') if p.is_file()]
    return max(files, key=lambda path: path.stat().st_mtime) if files else None


if __name__ == '__main__':
    path = latest_log()
    if path is None:
        raise SystemExit(message('未找到安装日志。请在安装目录运行 bash install.sh --resume，失败后再执行本命令。',
                                 'No installation log found. Resume the installer and rerun this command after a failure.'))
    print(message('最近的安装日志：', 'Latest installation log: ') + str(path))
    with path.open('rb') as stream:
        stream.seek(max(0, path.stat().st_size - 32768))
        lines = stream.read().decode('utf-8', errors='replace').splitlines()
    print('\n'.join(lines[-80:]))
