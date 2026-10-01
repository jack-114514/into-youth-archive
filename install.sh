#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
repo=${REPOSITORY_URL:-https://github.com/jack-114514/into-youth-archive.git}
destination=${INSTALL_DIR:-/opt/memory-archive}
script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
if [[ ${EUID} -ne 0 ]]; then
  echo '请使用 sudo bash install.sh 安装到自己的 VPS。' >&2; exit 1
fi
if [[ ! -r /etc/os-release ]]; then echo '需要 Debian/Ubuntu Linux。' >&2; exit 1; fi
source /etc/os-release
case "$ID" in debian|ubuntu) ;; *) echo '自动安装支持 Debian / Ubuntu；其他系统请按 README 使用 Docker Compose。' >&2; exit 1;; esac
if ! command -v git >/dev/null || ! command -v curl >/dev/null || ! command -v python3 >/dev/null; then
  apt-get update
  apt-get install -y git curl python3 ca-certificates
fi
if [[ ! -f "$script_dir/compose.yaml" ]]; then
  if [[ -e "$destination" ]]; then echo '目标目录已存在，已停止，防止覆盖已有站点。' >&2; exit 1; fi
  [[ "$repo" =~ ^https://github\.com/[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+(\.git)?$ ]] || { echo '仓库地址须为 GitHub HTTPS 地址。' >&2; exit 1; }
  git clone --depth 1 -- "$repo" "$destination"
  exec bash "$destination/install.sh"
fi
cd -- "$script_dir"
if [[ -f .env ]]; then echo '已经配置过站点。更新请运行 bash scripts/update.sh；配置请运行 bash scripts/reconfigure.sh。' >&2; exit 1; fi
if ! command -v docker >/dev/null; then
  echo '正在从 Docker 官方安装脚本安装 Docker Engine 和 Compose。'
  docker_setup=$(mktemp)
  curl --fail --show-error --silent --location https://get.docker.com -o "$docker_setup"
  sh "$docker_setup"
fi
docker compose version >/dev/null || { echo '请安装 Docker Compose v2 插件。' >&2; exit 1; }
python3 scripts/configure.py
docker compose config --quiet
docker compose build
docker compose up -d --wait --wait-timeout 180
python3 scripts/health.py
echo '安装完成。访问你的域名，后台路径 /admin。账号密码保存在当前目录 .env，请妥善保管。'
