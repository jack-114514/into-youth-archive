#!/usr/bin/env bash
set -Eeuo pipefail
cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.."
[[ -z "$(git status --porcelain)" ]] || { echo '源码有本地修改，请先保存为自己的提交，再更新。' >&2; exit 1; }
old=$(git rev-parse HEAD)
bash scripts/backup.sh
backup=$(cat backups/latest.txt)
docker image tag memory-archive-web:local "memory-archive-web:rollback-${old}"
docker image tag memory-archive-backend:local "memory-archive-backend:rollback-${old}"
rollback() {
  trap - ERR
  git checkout --detach "$old"
  docker image tag "memory-archive-web:rollback-${old}" memory-archive-web:local
  docker image tag "memory-archive-backend:rollback-${old}" memory-archive-backend:local
  docker compose up -d --no-build --wait --wait-timeout 180
  echo "更新失败，已恢复旧代码/镜像。数据备份在 $backup；没有覆盖数据库或上传文件。" >&2
  exit 1
}
trap rollback ERR
git fetch origin main
git merge --ff-only origin/main
docker compose build
docker compose up -d --no-build --wait --wait-timeout 180
python3 scripts/health.py
echo "更新成功；独立回滚点 $backup 和 rollback 镜像已保留。"
