"""Versioned, additive API used by the native Flutter administrator app.

This module deliberately does not replace the website's existing ``/api/admin``
surface.  It keeps the first release single-administrator while using renewable,
server-revocable tokens so a future multi-admin migration can be added without
changing the mobile client's authentication contract.
"""

from __future__ import annotations

import hashlib
import hmac
import json
import os
import re
import secrets
import shutil
import sqlite3
import threading
import time
from collections import defaultdict, deque
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import parse_qs, urlparse


DATA_DIR = Path(os.environ.get("SITE_DATA_DIR", "/opt/into-youth/data"))
UPLOAD_DIR = Path(os.environ.get("SITE_UPLOAD_DIR", "/opt/into-youth/uploads"))
DB_PATH = DATA_DIR / "site.db"
PASSWORD_ITERATIONS = 600_000
LEGACY_PASSWORD_ITERATIONS = 240_000
ACCESS_TTL_SECONDS = 30 * 60
REFRESH_TTL_SECONDS = 30 * 24 * 60 * 60
MAX_JSON_BODY = 2 * 1024 * 1024
MAX_UPLOAD_BODY = 18 * 1024 * 1024

_RATE_LOCK = threading.Lock()
_RATE_BUCKETS: dict[str, deque[float]] = defaultdict(deque)
_RATE_PEPPER = secrets.token_bytes(32)

ALLOWED_SETTINGS = {
    "site_title", "browser_title", "site_icon_url", "nav_logo_url",
    "hero_title", "profile_text", "hero_primary_button", "hero_secondary_button",
    "primary_color", "accent_color", "background_color", "color_mode",
    "home_background_url", "home_item_limit", "show_stories", "show_timeline",
    "show_about", "show_comments", "corner_radius", "glass_opacity",
    "motion_intensity", "particle_level", "star_level", "snow_level",
    "quality_3d", "auto_rotate_speed", "music_default_on", "card_style",
    "font_preset", "github_url", "contact_email", "mobile_effect_level",
    "app_display_name", "app_logo_url", "timeline_items",
}
UPLOAD_TYPES = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
    "video/mp4": "mp4",
    "video/webm": "webm",
}


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _db() -> sqlite3.Connection:
    connection = sqlite3.connect(DB_PATH, timeout=10)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    connection.execute("PRAGMA journal_mode = WAL")
    return connection


def initialize_admin_app_api() -> None:
    with _db() as connection:
        connection.executescript(
            """
            CREATE TABLE IF NOT EXISTS admin_app_sessions (
              refresh_hash TEXT PRIMARY KEY,
              access_hash TEXT NOT NULL UNIQUE,
              access_expires_at INTEGER NOT NULL,
              refresh_expires_at INTEGER NOT NULL,
              created_at TEXT NOT NULL,
              last_used_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS admin_operation_logs (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              action TEXT NOT NULL,
              entity_type TEXT NOT NULL DEFAULT '',
              entity_id TEXT NOT NULL DEFAULT '',
              request_id TEXT NOT NULL,
              created_at TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_admin_app_access
              ON admin_app_sessions(access_hash, access_expires_at);
            CREATE INDEX IF NOT EXISTS idx_admin_operation_created
              ON admin_operation_logs(created_at DESC);
            """
        )
        now = int(time.time())
        connection.execute(
            "DELETE FROM admin_app_sessions WHERE refresh_expires_at < ?",
            (now,),
        )


def _request_id() -> str:
    return secrets.token_hex(8)


def _rate_key(handler, scope: str) -> str:
    address = str(handler.headers.get("CF-Connecting-IP", "")).strip()
    if not address:
        forwarded = str(handler.headers.get("X-Forwarded-For", "")).split(",", 1)[0].strip()
        address = forwarded or str(
            handler.client_address[0] if handler.client_address else "unknown"
        )
    digest = hmac.new(_RATE_PEPPER, address.encode("utf-8"), hashlib.sha256).hexdigest()
    return f"{scope}:{digest}"


def _allow_request(handler, scope: str, limit: int, window_seconds: int) -> bool:
    """Temporarily throttle a client without persisting or banning its IP."""
    now = time.monotonic()
    cutoff = now - window_seconds
    key = _rate_key(handler, scope)
    with _RATE_LOCK:
        bucket = _RATE_BUCKETS[key]
        while bucket and bucket[0] <= cutoff:
            bucket.popleft()
        if len(bucket) >= limit:
            return False
        bucket.append(now)
        if len(_RATE_BUCKETS) > 2048:
            for candidate in list(_RATE_BUCKETS)[:256]:
                values = _RATE_BUCKETS[candidate]
                if not values or values[-1] <= cutoff:
                    _RATE_BUCKETS.pop(candidate, None)
    return True


def _require_rate(handler, request_id: str, scope: str, limit: int, window: int) -> bool:
    if _allow_request(handler, scope, limit, window):
        return True
    _error(handler, 429, "rate_limited", "请求过于频繁，请稍后重试", request_id)
    return False


def _send(handler, status: int, payload: dict) -> None:
    handler.send_json(status, payload)


def _error(handler, status: int, code: str, message: str, request_id: str) -> None:
    _send(
        handler,
        status,
        {"error": {"code": code, "message": message, "request_id": request_id}},
    )


def _read_json(handler) -> dict:
    try:
        length = int(handler.headers.get("Content-Length", "0"))
    except ValueError as exc:
        raise ValueError("无效的 Content-Length") from exc
    if length <= 0 or length > MAX_JSON_BODY:
        raise ValueError("请求内容为空或过大")
    try:
        value = json.loads(handler.rfile.read(length).decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise ValueError("JSON 格式无效") from exc
    if not isinstance(value, dict):
        raise ValueError("请求必须是 JSON 对象")
    return value


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _password_hash(password: str, salt: bytes, iterations: int) -> bytes:
    return hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, iterations)


def _new_session(connection: sqlite3.Connection) -> dict:
    access_token = secrets.token_urlsafe(40)
    refresh_token = secrets.token_urlsafe(56)
    now = int(time.time())
    created_at = _now_iso()
    connection.execute(
        "INSERT INTO admin_app_sessions("
        "refresh_hash,access_hash,access_expires_at,refresh_expires_at,created_at,last_used_at"
        ") VALUES(?,?,?,?,?,?)",
        (
            _hash_token(refresh_token),
            _hash_token(access_token),
            now + ACCESS_TTL_SECONDS,
            now + REFRESH_TTL_SECONDS,
            created_at,
            created_at,
        ),
    )
    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token_type": "Bearer",
        "expires_in": ACCESS_TTL_SECONDS,
        "refresh_expires_in": REFRESH_TTL_SECONDS,
    }


def _access_hash(handler) -> str | None:
    authorization = handler.headers.get("Authorization", "")
    if not authorization.startswith("Bearer "):
        return None
    token = authorization[7:].strip()
    return _hash_token(token) if token else None


def _require_session(handler, request_id: str) -> str | None:
    access_hash = _access_hash(handler)
    if not access_hash:
        _error(handler, 401, "authentication_required", "请先登录管理员 App", request_id)
        return None
    now = int(time.time())
    with _db() as connection:
        row = connection.execute(
            "SELECT access_expires_at FROM admin_app_sessions WHERE access_hash=?",
            (access_hash,),
        ).fetchone()
        if not row or row["access_expires_at"] < now:
            connection.execute(
                "DELETE FROM admin_app_sessions WHERE access_hash=? OR refresh_expires_at<?",
                (access_hash, now),
            )
            _error(handler, 401, "access_token_expired", "登录状态已过期，请刷新令牌", request_id)
            return None
        connection.execute(
            "UPDATE admin_app_sessions SET last_used_at=? WHERE access_hash=?",
            (_now_iso(), access_hash),
        )
    return access_hash


def _audit(
    connection: sqlite3.Connection,
    action: str,
    request_id: str,
    entity_type: str = "",
    entity_id: object = "",
) -> None:
    connection.execute(
        "INSERT INTO admin_operation_logs(action,entity_type,entity_id,request_id,created_at) "
        "VALUES(?,?,?,?,?)",
        (action[:80], entity_type[:40], str(entity_id)[:80], request_id, _now_iso()),
    )


def _media_time_key(row: sqlite3.Row) -> str:
    value = str(row["taken_at"] or row["created_at"] or "").strip()
    return value.replace("T", " ")


def _reposition_media(
    connection: sqlite3.Connection,
    media_id: int,
    requested_position: int | None,
) -> None:
    rows = list(
        connection.execute(
            "SELECT id,taken_at,created_at FROM media ORDER BY sort_order ASC,id ASC"
        ).fetchall()
    )
    moving = next((row for row in rows if row["id"] == media_id), None)
    if moving is None:
        return
    rows = [row for row in rows if row["id"] != media_id]
    if requested_position is None:
        moving_key = _media_time_key(moving)
        insert_at = len(rows)
        if moving_key:
            for index, row in enumerate(rows):
                key = _media_time_key(row)
                if key and key > moving_key:
                    insert_at = index
                    break
    else:
        insert_at = max(0, min(requested_position - 1, len(rows)))
    rows.insert(insert_at, moving)
    for index, row in enumerate(rows, start=1):
        connection.execute(
            "UPDATE media SET sort_order=? WHERE id=?", (index, row["id"])
        )


def _bool_int(value, default: int = 1) -> int:
    if value is None:
        return default
    return 0 if str(value).lower() in {"0", "false", "off", "no"} else 1


def _optional_order(value) -> int | None:
    if value in (None, ""):
        return None
    order = int(value)
    if order < 1:
        raise ValueError("展示顺序必须大于 0")
    return order


def _media_payload(data: dict, existing: sqlite3.Row | None = None) -> dict:
    fallback = dict(existing) if existing else {}
    url = str(data.get("url", fallback.get("url", ""))).strip()[:500]
    video_url = str(data.get("video_url", fallback.get("video_url", ""))).strip()[:500]
    if not url and not video_url:
        raise ValueError("每条内容至少需要一张图片或一个视频")
    return {
        "url": url,
        "video_url": video_url,
        "title": str(data.get("title", fallback.get("title", "未命名内容"))).strip()[:100],
        "meta": str(data.get("meta", fallback.get("meta", ""))).strip()[:100],
        "body": str(data.get("body", fallback.get("body", ""))).strip()[:3000],
        "taken_at": str(data.get("taken_at", fallback.get("taken_at", ""))).strip()[:32],
        "show_on_home": _bool_int(data.get("show_on_home"), int(fallback.get("show_on_home", 1))),
        "show_in_3d": _bool_int(data.get("show_in_3d"), int(fallback.get("show_in_3d", 1))),
        "sort_order": _optional_order(data.get("sort_order")),
    }


def dispatch_get(handler, path: str) -> None:
    request_id = _request_id()
    if not _require_rate(handler, request_id, "general", 240, 60):
        return
    if not _require_session(handler, request_id):
        return
    query = parse_qs(urlparse(handler.path).query)
    with _db() as connection:
        if path == "/api/v1/admin-app/dashboard":
            upload_bytes = (
                sum(item.stat().st_size for item in UPLOAD_DIR.iterdir() if item.is_file())
                if UPLOAD_DIR.exists()
                else 0
            )
            disk = shutil.disk_usage(UPLOAD_DIR if UPLOAD_DIR.exists() else DATA_DIR)
            counts = {
                "media": connection.execute("SELECT COUNT(*) FROM media").fetchone()[0],
                "comments": connection.execute("SELECT COUNT(*) FROM comments").fetchone()[0],
                "visible_comments": connection.execute(
                    "SELECT COUNT(*) FROM comments WHERE status='visible'"
                ).fetchone()[0],
                "pending_submissions": connection.execute(
                    "SELECT COUNT(*) FROM submissions WHERE status='pending'"
                ).fetchone()[0],
                "page_views": connection.execute(
                    "SELECT value FROM site_stats WHERE key='page_views'"
                ).fetchone()[0],
            }
            return _send(
                handler,
                200,
                {
                    "counts": counts,
                    "database": {
                        "status": "ok",
                        "size_bytes": DB_PATH.stat().st_size if DB_PATH.exists() else 0,
                    },
                    "storage": {
                        "status": "ok",
                        "uploads_bytes": upload_bytes,
                        "disk_free_bytes": disk.free,
                        "disk_total_bytes": disk.total,
                    },
                    "server_time": _now_iso(),
                    "api_version": "v1",
                },
            )
        if path == "/api/v1/admin-app/media":
            rows = connection.execute(
                "SELECT * FROM media ORDER BY sort_order ASC,id ASC"
            ).fetchall()
            return _send(handler, 200, {"media": [dict(row) for row in rows]})
        if path == "/api/v1/admin-app/comments":
            status = query.get("status", ["all"])[0]
            if status not in {"all", "visible", "hidden"}:
                return _error(handler, 400, "validation_error", "评论状态无效", request_id)
            sql = "SELECT * FROM comments"
            params: tuple = ()
            if status != "all":
                sql += " WHERE status=?"
                params = (status,)
            rows = connection.execute(sql + " ORDER BY id DESC LIMIT 500", params).fetchall()
            return _send(handler, 200, {"comments": [dict(row) for row in rows]})
        if path == "/api/v1/admin-app/submissions":
            status = query.get("status", ["all"])[0]
            allowed = {"all", "pending", "accepted", "rejected"}
            if status not in allowed:
                return _error(handler, 400, "validation_error", "投稿状态无效", request_id)
            sql = "SELECT * FROM submissions"
            params = ()
            if status != "all":
                sql += " WHERE status=?"
                params = (status,)
            rows = connection.execute(sql + " ORDER BY id DESC LIMIT 500", params).fetchall()
            return _send(handler, 200, {"submissions": [dict(row) for row in rows]})
        if path == "/api/v1/admin-app/settings":
            setting_keys = tuple(sorted(ALLOWED_SETTINGS))
            placeholders = ",".join("?" for _ in setting_keys)
            rows = connection.execute(
                f"SELECT key,value FROM settings WHERE key IN ({placeholders})",
                setting_keys,
            ).fetchall()
            return _send(handler, 200, {"settings": {row["key"]: row["value"] for row in rows}})
        if path == "/api/v1/admin-app/operation-logs":
            try:
                limit = max(1, min(int(query.get("limit", ["100"])[0]), 200))
            except ValueError:
                return _error(handler, 400, "validation_error", "日志数量无效", request_id)
            rows = connection.execute(
                "SELECT action,entity_type,entity_id,request_id,created_at "
                "FROM admin_operation_logs ORDER BY id DESC LIMIT ?",
                (limit,),
            ).fetchall()
            return _send(handler, 200, {"logs": [dict(row) for row in rows]})
        if path == "/api/v1/admin-app/session":
            admin = connection.execute("SELECT username FROM admins WHERE id=1").fetchone()
            username = admin["username"] if admin else ""
            local, separator, domain = username.partition("@")
            masked = f"{local[:2]}***@{domain}" if separator else "管理员"
            return _send(handler, 200, {"administrator": masked, "mode": "single_admin"})
    _error(handler, 404, "not_found", "未找到接口", request_id)


def dispatch_post(handler, path: str) -> None:
    request_id = _request_id()
    try:
        if path == "/api/v1/admin-app/auth/login":
            if not _require_rate(handler, request_id, "login", 10, 300):
                return
            data = _read_json(handler)
            username = str(data.get("username", "")).strip().lower()
            password = str(data.get("password", ""))
            with _db() as connection:
                row = connection.execute(
                    "SELECT username,salt,password_hash FROM admins WHERE id=1"
                ).fetchone()
                username_ok = bool(row) and hmac.compare_digest(username, row["username"])
                current_ok = bool(row) and hmac.compare_digest(
                    _password_hash(password, row["salt"], PASSWORD_ITERATIONS),
                    row["password_hash"],
                )
                legacy_ok = bool(row) and not current_ok and hmac.compare_digest(
                    _password_hash(password, row["salt"], LEGACY_PASSWORD_ITERATIONS),
                    row["password_hash"],
                )
                if not username_ok or not (current_ok or legacy_ok):
                    time.sleep(0.35)
                    return _error(
                        handler, 401, "invalid_credentials", "用户名或密码不正确", request_id
                    )
                if legacy_ok:
                    salt = secrets.token_bytes(24)
                    connection.execute(
                        "UPDATE admins SET salt=?,password_hash=? WHERE id=1",
                        (salt, _password_hash(password, salt, PASSWORD_ITERATIONS)),
                    )
                tokens = _new_session(connection)
                _audit(connection, "login", request_id, "session")
            return _send(handler, 200, tokens)

        if path == "/api/v1/admin-app/auth/refresh":
            if not _require_rate(handler, request_id, "refresh", 60, 60):
                return
            data = _read_json(handler)
            refresh_token = str(data.get("refresh_token", "")).strip()
            if not refresh_token:
                return _error(
                    handler, 400, "validation_error", "缺少刷新令牌", request_id
                )
            refresh_hash = _hash_token(refresh_token)
            with _db() as connection:
                row = connection.execute(
                    "SELECT refresh_expires_at FROM admin_app_sessions WHERE refresh_hash=?",
                    (refresh_hash,),
                ).fetchone()
                if not row or row["refresh_expires_at"] < int(time.time()):
                    connection.execute(
                        "DELETE FROM admin_app_sessions WHERE refresh_hash=?", (refresh_hash,)
                    )
                    return _error(
                        handler, 401, "refresh_token_expired", "请重新登录", request_id
                    )
                connection.execute(
                    "DELETE FROM admin_app_sessions WHERE refresh_hash=?", (refresh_hash,)
                )
                tokens = _new_session(connection)
                _audit(connection, "refresh_session", request_id, "session")
            return _send(handler, 200, tokens)

        if not _require_session(handler, request_id):
            return
        if not _require_rate(handler, request_id, "general", 240, 60):
            return

        if path == "/api/v1/admin-app/auth/logout":
            access_hash = _access_hash(handler)
            with _db() as connection:
                connection.execute(
                    "DELETE FROM admin_app_sessions WHERE access_hash=?", (access_hash,)
                )
                _audit(connection, "logout", request_id, "session")
            return _send(handler, 200, {"ok": True})

        if path == "/api/v1/admin-app/uploads":
            if not _require_rate(handler, request_id, "upload", 30, 600):
                return
            content_type = handler.headers.get("Content-Type", "").split(";", 1)[0].lower()
            extension = UPLOAD_TYPES.get(content_type)
            if not extension:
                return _error(
                    handler,
                    400,
                    "unsupported_media_type",
                    "仅支持 JPG、PNG、WebP、GIF、MP4 或 WebM",
                    request_id,
                )
            try:
                length = int(handler.headers.get("Content-Length", "0"))
            except ValueError:
                length = 0
            if length <= 0 or length > MAX_UPLOAD_BODY:
                return _error(
                    handler, 413, "file_too_large", "文件为空或超过 18MB", request_id
                )
            raw = handler.rfile.read(length)
            if len(raw) != length:
                return _error(
                    handler, 400, "incomplete_upload", "文件上传不完整", request_id
                )
            UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
            name = f"{int(time.time())}-{secrets.token_hex(10)}.{extension}"
            destination = UPLOAD_DIR / name
            destination.write_bytes(raw)
            with _db() as connection:
                _audit(connection, "upload", request_id, "upload", name)
            return _send(
                handler,
                201,
                {"url": f"/uploads/{name}", "content_type": content_type, "size": length},
            )

        data = _read_json(handler)
        if path == "/api/v1/admin-app/media":
            payload = _media_payload(data)
            with _db() as connection:
                next_order = connection.execute(
                    "SELECT COALESCE(MAX(sort_order),0)+1 FROM media"
                ).fetchone()[0]
                cursor = connection.execute(
                    "INSERT INTO media("
                    "url,video_url,title,meta,body,taken_at,sort_order,sort_manual,"
                    "show_on_home,show_in_3d,created_at"
                    ") VALUES(?,?,?,?,?,?,?,?,?,?,?)",
                    (
                        payload["url"],
                        payload["video_url"],
                        payload["title"],
                        payload["meta"],
                        payload["body"],
                        payload["taken_at"],
                        next_order,
                        1 if payload["sort_order"] else 0,
                        payload["show_on_home"],
                        payload["show_in_3d"],
                        _now_iso(),
                    ),
                )
                _reposition_media(connection, cursor.lastrowid, payload["sort_order"])
                _audit(connection, "create", request_id, "media", cursor.lastrowid)
            return _send(handler, 201, {"id": cursor.lastrowid})
    except (TypeError, ValueError) as exc:
        return _error(handler, 400, "validation_error", str(exc), request_id)
    except Exception as exc:
        print(f"Admin App API error [{request_id}]: {type(exc).__name__}")
        return _error(
            handler, 500, "internal_error", "服务器暂时无法处理请求", request_id
        )
    _error(handler, 404, "not_found", "未找到接口", request_id)


def dispatch_patch(handler, path: str) -> None:
    request_id = _request_id()
    if not _require_rate(handler, request_id, "general", 240, 60):
        return
    if not _require_session(handler, request_id):
        return
    try:
        data = _read_json(handler)
        media_match = re.fullmatch(r"/api/v1/admin-app/media/(\d+)", path)
        comment_match = re.fullmatch(r"/api/v1/admin-app/comments/(\d+)", path)
        submission_match = re.fullmatch(r"/api/v1/admin-app/submissions/(\d+)", path)
        with _db() as connection:
            if media_match:
                media_id = int(media_match.group(1))
                existing = connection.execute(
                    "SELECT * FROM media WHERE id=?", (media_id,)
                ).fetchone()
                if not existing:
                    return _error(handler, 404, "not_found", "内容不存在", request_id)
                payload = _media_payload(data, existing)
                connection.execute(
                    "UPDATE media SET url=?,video_url=?,title=?,meta=?,body=?,taken_at=?,"
                    "sort_manual=?,show_on_home=?,show_in_3d=? WHERE id=?",
                    (
                        payload["url"],
                        payload["video_url"],
                        payload["title"],
                        payload["meta"],
                        payload["body"],
                        payload["taken_at"],
                        1 if payload["sort_order"] else 0,
                        payload["show_on_home"],
                        payload["show_in_3d"],
                        media_id,
                    ),
                )
                _reposition_media(connection, media_id, payload["sort_order"])
                _audit(connection, "update", request_id, "media", media_id)
                return _send(handler, 200, {"ok": True})
            if comment_match:
                status = str(data.get("status", ""))
                if status not in {"visible", "hidden"}:
                    raise ValueError("评论状态无效")
                comment_id = int(comment_match.group(1))
                cursor = connection.execute(
                    "UPDATE comments SET status=? WHERE id=?", (status, comment_id)
                )
                if not cursor.rowcount:
                    return _error(handler, 404, "not_found", "评论不存在", request_id)
                _audit(connection, "update_status", request_id, "comment", comment_id)
                return _send(handler, 200, {"ok": True})
            if submission_match:
                status = str(data.get("status", ""))
                if status not in {"pending", "accepted", "rejected"}:
                    raise ValueError("投稿状态无效")
                submission_id = int(submission_match.group(1))
                cursor = connection.execute(
                    "UPDATE submissions SET status=? WHERE id=?", (status, submission_id)
                )
                if not cursor.rowcount:
                    return _error(handler, 404, "not_found", "投稿不存在", request_id)
                _audit(
                    connection, "update_status", request_id, "submission", submission_id
                )
                return _send(handler, 200, {"ok": True})
            if path == "/api/v1/admin-app/settings":
                changed = []
                for key, value in data.items():
                    if key not in ALLOWED_SETTINGS:
                        continue
                    limit = 12000 if key == "timeline_items" else 2000
                    connection.execute(
                        "INSERT INTO settings(key,value) VALUES(?,?) "
                        "ON CONFLICT(key) DO UPDATE SET value=excluded.value",
                        (key, str(value)[:limit]),
                    )
                    changed.append(key)
                _audit(connection, "update", request_id, "settings", ",".join(changed))
                return _send(handler, 200, {"ok": True, "changed": changed})
    except (TypeError, ValueError) as exc:
        return _error(handler, 400, "validation_error", str(exc), request_id)
    except Exception as exc:
        print(f"Admin App API error [{request_id}]: {type(exc).__name__}")
        return _error(
            handler, 500, "internal_error", "服务器暂时无法处理请求", request_id
        )
    _error(handler, 404, "not_found", "未找到接口", request_id)


def dispatch_delete(handler, path: str) -> None:
    request_id = _request_id()
    if not _require_rate(handler, request_id, "general", 240, 60):
        return
    if not _require_session(handler, request_id):
        return
    match = re.fullmatch(
        r"/api/v1/admin-app/(media|comments|submissions)/(\d+)", path
    )
    if not match:
        return _error(handler, 404, "not_found", "未找到接口", request_id)
    table = match.group(1)
    entity_id = int(match.group(2))
    try:
        with _db() as connection:
            cursor = connection.execute(f"DELETE FROM {table} WHERE id=?", (entity_id,))
            if not cursor.rowcount:
                return _error(handler, 404, "not_found", "记录不存在", request_id)
            if table == "media":
                rows = connection.execute(
                    "SELECT id FROM media ORDER BY sort_order ASC,id ASC"
                ).fetchall()
                for index, row in enumerate(rows, start=1):
                    connection.execute(
                        "UPDATE media SET sort_order=? WHERE id=?", (index, row["id"])
                    )
            _audit(connection, "delete", request_id, table.rstrip("s"), entity_id)
        _send(handler, 200, {"ok": True})
    except Exception as exc:
        print(f"Admin App API error [{request_id}]: {type(exc).__name__}")
        _error(handler, 500, "internal_error", "服务器暂时无法处理请求", request_id)
