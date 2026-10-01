#!/usr/bin/env bash
set -Eeuo pipefail
cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.."
bash scripts/backup.sh
previous=$(cat backups/latest.txt)
rollback() {
  trap - ERR
  cp -- "$previous/config.env" .env
  docker compose up -d --force-recreate --wait --wait-timeout 180
  echo '配置应用失败，已恢复原配置。备份已保留。' >&2
  exit 1
}
trap rollback ERR
python3 scripts/configure.py --edit
docker compose config --quiet
docker compose up -d --force-recreate --wait --wait-timeout 180
python3 scripts/health.py
