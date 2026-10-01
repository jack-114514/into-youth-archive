#!/usr/bin/env python3
import subprocess
from pathlib import Path
ROOT = Path(__file__).resolve().parent.parent
if __name__ == '__main__':
    subprocess.run(['docker','compose','exec','-T','backend','python','-c',
      "import json,urllib.request; data=json.load(urllib.request.urlopen('http://127.0.0.1:8765/api/health',timeout=5)); assert data['ok']"],cwd=ROOT,check=True)
    for path in ('/', '/admin', '/memory', '/api/health', '/api/content', '/api/public-config'):
        subprocess.run(['docker','compose','exec','-T','web','wget','-q','-O','/dev/null',
          f'http://127.0.0.1:8080{path}'],cwd=ROOT,check=True)
    print('容器网页和 API 健康检查通过。HTTPS 证书需 DNS 正确指向 VPS 且 80/443 可访问。')
