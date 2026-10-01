#!/usr/bin/env python3
"""Audit only files eligible for publication; never prints matching values."""
from pathlib import Path
import re
import subprocess
import sys
ROOT = Path(__file__).resolve().parent.parent

def candidate_files():
    data = subprocess.check_output(['git','ls-files','-z','--cached','--others','--exclude-standard'],cwd=ROOT)
    return sorted(set(x for x in data.decode('utf-8').split('\0') if x))
def check():
    errors=[]
    for name in candidate_files():
        p=ROOT/name
        if not p.exists(): continue
        if p.is_symlink(): errors.append((name,'symbolic link not allowed')); continue
        parts=p.relative_to(ROOT).parts
        if any(part in {'.git','node_modules','uploads','data','backups','.dart_tool','work'} for part in parts):
            errors.append((name,'private/runtime directory'))
        if p.suffix.lower() in {'.db','.sqlite','.sqlite3','.jks','.keystore','.p12','.pem','.key','.apk','.aab'}:
            errors.append((name,'database/key/build artifact'))
        if p.name in {'.env','key.properties','local.properties','AGENTS.md'}:
            errors.append((name,'local configuration'))
        if p.name.startswith('.env') and p.name != '.env.example': errors.append((name,'actual environment file'))
        content=p.read_bytes()
        try: text=content.decode('utf-8')
        except UnicodeDecodeError: continue
        if re.search(r'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,}',text):
            errors.append((name,'private key/token pattern'))
        ip_text = text if p.suffix != '.svg' else '\n'.join(re.findall(r'https?://[^"\s<>]+', text))
        for literal in re.findall(r'(?<![\d.])(?:\d{1,3}\.){3}\d{1,3}(?![\d.])',ip_text):
            if literal not in {'127.0.0.1','0.0.0.0'}: errors.append((name,'non-local IP address literal')); break
        if re.search(r'(?:into)?valabs\.(?:com|net)|0x4AAAA[A-Za-z0-9]{10,}',text,re.IGNORECASE):
            errors.append((name,'owner-specific address or site key'))
        if name.startswith(('components/','app/','vps-app/','server/','mobile-admin-app/lib/')) and re.search(r'jack-\d{4,}',text):
            errors.append((name,'owner-specific runtime contact'))
        if name.startswith('public/') and p.suffix.lower() in {'.jpg','.jpeg','.webp','.mp4','.mov'}:
            errors.append((name,'unreviewed photo/video asset'))
    for name, reason in errors: print(f'FAIL {name}: {reason}',file=sys.stderr)
    if errors: return 1
    print(f'Public-source audit passed: {len(candidate_files())} candidate paths, no private configuration or personal media.'); return 0
if __name__=='__main__': raise SystemExit(check())
