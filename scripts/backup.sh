#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.."
stamp=$(date +%Y%m%d-%H%M%S)-${RANDOM}
backup="backups/$stamp"
mkdir -p -- "$backup"
chmod 700 "$backup"
cp -- .env "$backup/config.env"
git rev-parse HEAD > "$backup/git-commit.txt"
docker compose exec -T backend python -c "import sqlite3; s=sqlite3.connect('/data/site.db'); d=sqlite3.connect('/data/backup-$stamp.db'); s.backup(d); d.close(); s.close()"
docker compose cp "backend:/data/backup-$stamp.db" "$backup/site.db"
docker compose exec -T backend tar -C /uploads -czf - . > "$backup/uploads.tar.gz"
printf '%s\n' "$backup" > backups/latest.txt
echo "已备份数据库、上传文件和配置到 $backup；请另存到站外。"
