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
import sys
import threading
import time
from collections import defaultdict, deque
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import parse_qs, urlparse

try:
    import notes
except ModuleNotFoundError:
    from server import notes

try:
    import media_thumbnails
except ModuleNotFoundError:
    from server import media_thumbnails

try:
    import desktop_pet
except ModuleNotFoundError:
    from server import desktop_pet


try:
    import mobile_turnstile
    import login_security
except ModuleNotFoundError:
    from server import mobile_turnstile, login_security

DATA_DIR = Path(os.environ.get("SITE_DATA_DIR", "/opt/memory-archive/data"))
UPLOAD_DIR = Path(os.environ.get("SITE_UPLOAD_DIR", "/opt/memory-archive/uploads"))
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

HOME_CARD_ORDER_KEYS = (
    "home_card_story_image", "home_card_memory_image", "home_card_timeline_image",
    "home_card_campus_image", "home_card_notes_image", "home_card_about_image",
    "home_card_messages_image",
)

ALLOWED_SETTINGS = {
    "site_title", "footer_title", "footer_subtitle", "browser_title", "site_icon_url", "nav_logo_url",
    "hero_title", "profile_text", "hero_primary_button", "hero_secondary_button",
    "hero_art_style", "hero_motion_level", "hero_show_captions",
    "primary_color", "accent_color", "background_color", "color_mode",
    "home_background_tone", "home_background_color", "home_accent_color", "home_background_overlay_opacity", "home_background_blur",
    "home_profile_avatar", "home_background_url", "home_hero_image", "about_page_image", "home_card_story_image", "home_card_memory_image",
    "home_card_timeline_image", "home_card_campus_image", "home_card_notes_image",
    "home_card_about_image", "home_card_messages_image",
    "home_card_visibility", "home_card_order",
    "home_hero_caption_kicker", "home_hero_caption_title",
    "home_card_tone", "home_card_tone_color", "home_card_surface_opacity", "home_card_image_overlay_opacity",
    "home_card_aspect_ratio", "home_card_aspects", "home_card_crops",
    "home_item_limit", "show_stories", "show_timeline",
    "show_about", "show_comments", "corner_radius", "glass_opacity",
    "motion_intensity", "particle_level", "star_level", "snow_level",
    "quality_3d", "auto_rotate_speed", "music_default_on", "music_default_volume", "music_playlist", "card_style",
    "galaxy_scene_preset", "galaxy_particle_density", "galaxy_snow_density",
    "galaxy_particle_brightness", "galaxy_growth_duration", "galaxy_photo_scale",
    "galaxy_photo_spread", "galaxy_photo_border_color",
    "font_preset", "github_url", "contact_email", "contact_douyin_url", "contact_custom_links", "mobile_effect_level",
    "app_display_name", "app_logo_url", "display_font_scale",
    "display_media_scale", "timeline_items", "notes_title", "notes_body",
}
ALLOWED_SETTINGS.update(
    f"home_{section}_{field}"
    for section in ("hero", "stories", "portal", "campus", "timeline", "notes", "about", "comments")
    for field in ("kicker", "title", "accent", "subtitle", "extra_text", "extra_enabled", "title_size", "title_weight")
)
INTRO_SETTING_DEFAULTS = {
    "intro_logo": "",
    "intro_title": "记忆档案",
    "intro_subtitle": "MY MEMORY ARCHIVE",
    "intro_background_image": "/assets/demo-intro.svg",
    "intro_background_desktop_image": "/assets/demo-intro.svg",
    "intro_background_mobile_image": "",
    "intro_background_desktop_x": "50",
    "intro_background_desktop_y": "50",
    "intro_background_desktop_zoom": "100",
    "intro_background_desktop_crop_left": "",
    "intro_background_desktop_crop_top": "",
    "intro_background_desktop_crop_width": "",
    "intro_background_desktop_crop_height": "",
    "intro_background_desktop_ratio_locked": "1",
    "intro_background_mobile_x": "50",
    "intro_background_mobile_y": "50",
    "intro_background_mobile_zoom": "100",
    "intro_background_mobile_crop_left": "",
    "intro_background_mobile_crop_top": "",
    "intro_background_mobile_crop_width": "",
    "intro_background_mobile_crop_height": "",
    "intro_background_mobile_ratio_locked": "1",
    "intro_background_blur": "0",
    "intro_background_brightness": "104",
    "intro_background_overlay": "100",
    "intro_watermark_opacity": "13",
    "intro_watermark_1": "YOUTH",
    "intro_watermark_2": "MEMORY",
    "intro_enabled": "1",
    "intro_show_enter_button": "1",
    "intro_loading_duration": "6000",
}
UPLOAD_TYPES = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
    "video/mp4": "mp4",
    "video/webm": "webm",
    "audio/mpeg": "mp3",
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
    address = login_security.client_ip(handler)
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


def _error(handler, status: int, code: str, message: str, request_id: str, **fields) -> None:
    _send(
        handler,
        status,
        {"error": {"code": code, "message": message, "request_id": request_id}, **fields},
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


def _sanitize_music_playlist(value) -> str:
    try:
        tracks = json.loads(value) if isinstance(value, str) else value
    except (TypeError, ValueError):
        tracks = []
    if not isinstance(tracks, list):
        return "[]"
    clean = []
    for index, item in enumerate(tracks[:20]):
        if not isinstance(item, dict):
            continue
        url = str(item.get("url", "")).strip()[:500]
        if not re.fullmatch(r"/uploads/[A-Za-z0-9._~!$&'()*+,;=:@%/-]+\.mp3", url, re.IGNORECASE):
            continue
        name = re.sub(r"[\x00-\x1f\x7f]", "", str(item.get("name", ""))).strip()[:80]
        track_id = re.sub(r"[^A-Za-z0-9_-]", "", str(item.get("id", "")))[:80]
        clean.append({"id": track_id or f"track-{index + 1}", "name": name or f"歌曲 {index + 1}", "url": url})
    return json.dumps(clean, ensure_ascii=False, separators=(",", ":"))


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
    thumbnail_url = str(data.get("thumbnail_url", fallback.get("thumbnail_url", ""))).strip()[:500]
    if url != fallback.get("url") and "thumbnail_url" not in data:
        thumbnail_url = ""
    if not thumbnail_url:
        thumbnail_url = media_thumbnails.generate(url, UPLOAD_DIR)
    return {
        "url": url,
        "thumbnail_url": thumbnail_url,
        "video_url": video_url,
        "title": str(data.get("title", fallback.get("title", "未命名内容"))).strip()[:100],
        "meta": str(data.get("meta", fallback.get("meta", ""))).strip()[:100],
        "body": str(data.get("body", fallback.get("body", ""))).strip()[:3000],
        "taken_at": str(data.get("taken_at", fallback.get("taken_at", ""))).strip()[:32],
        "show_on_home": _bool_int(data.get("show_on_home"), int(fallback.get("show_on_home", 1))),
        "show_in_3d": _bool_int(data.get("show_in_3d"), int(fallback.get("show_in_3d", 1))),
        "show_in_stories": _bool_int(data.get("show_in_stories"), int(fallback.get("show_in_stories", 0))),
        "sort_order": _optional_order(data.get("sort_order")),
    }


def _dispatch_notes(handler, path: str) -> bool:
    prefix = "/api/v1/admin-app/notes"
    if path != prefix and not re.fullmatch(re.escape(prefix) + r"/\d+", path):
        return False
    return notes.dispatch(handler, _db, handler.command, "/api/admin/notes" + path[len(prefix):], authorized=True)


def dispatch_get(handler, path: str) -> None:
    request_id = _request_id()
    if not _require_rate(handler, request_id, "general", 240, 60):
        return
    if path == "/api/v1/admin-app/auth/login-security":
        return _send(handler, 200, login_security.native_policy(_db))
    if path == "/api/v1/admin-app/auth/challenge":
        try:
            return mobile_turnstile.challenge_page(handler)
        except RuntimeError:
            return _error(handler, 503, "verification_unavailable", "登录人机验证尚未配置，请联系管理员", request_id)
    if not _require_session(handler, request_id):
        return
    if _dispatch_notes(handler, path):
        return
    query = parse_qs(urlparse(handler.path).query)
    with _db() as connection:
        if path == "/api/v1/admin-app/status":
            host = sys.modules[type(handler).__module__]
            return _send(handler, 200, host.build_admin_server_status(connection))
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
        if path == "/api/v1/admin-app/homepage-intro":
            keys = tuple(INTRO_SETTING_DEFAULTS)
            rows = connection.execute(
                f"SELECT key,value FROM settings WHERE key IN ({','.join('?' for _ in keys)})",
                keys,
            ).fetchall()
            settings = {**INTRO_SETTING_DEFAULTS, **{row["key"]: row["value"] for row in rows}}
            nodes = connection.execute(
                "SELECT id,title,subtitle,sort_order,enabled FROM homepage_intro_nodes "
                "ORDER BY sort_order ASC,id ASC"
            ).fetchall()
            return _send(handler, 200, {"settings": settings, "nodes": [dict(row) for row in nodes]})
        if path == "/api/v1/admin-app/pet":
            return _send(handler, 200, desktop_pet.admin_read(connection))
        if path == "/api/v1/admin-app/pet/presets":
            return _send(handler, 200, {"presets": desktop_pet.presets_read(connection)})
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
        if path in {'/api/v1/admin-app/account/recovery/code', '/api/v1/admin-app/account/recovery/complete'}:
            if not _require_rate(handler, request_id, 'password_recovery', 10, 600):
                return
            try:
                import admin_account_recovery
            except ModuleNotFoundError:
                from server import admin_account_recovery
            return admin_account_recovery.dispatch(handler, path, sys.modules[__name__], _read_json(handler), request_id)
        if path in {"/api/v1/admin-app/auth/challenge/start", "/api/v1/admin-app/auth/challenge/status", "/api/v1/admin-app/auth/challenge/complete"}:
            scope = 'challenge-status' if path.endswith('/status') else 'challenge-start' if path.endswith('/start') else 'challenge-complete'
            limit, window = (120, 60) if path.endswith('/status') else (10, 300)
            if not _require_rate(handler, request_id, scope, limit, window):
                return
            data = _read_json(handler)
            try:
                with _db() as connection:
                    if path.endswith('/start'):
                        result = mobile_turnstile.create_browser_challenge(connection)
                    elif path.endswith('/status'):
                        state = mobile_turnstile.browser_state(connection, data.get('challenge_id'), data.get('challenge_secret'))
                        if state is None:
                            return _error(handler, 404, 'challenge_not_found', '验证会话不存在或已失效，请重新验证', request_id)
                        result = {'status': state}
                    else:
                        if not mobile_turnstile.complete_browser_challenge(connection, data.get('challenge_id'), data.get('turnstile_token'), login_security.client_ip(handler)):
                            return _error(handler, 403, 'verification_required', '验证未通过或已过期，请重新验证', request_id)
                        result = {'status': 'verified'}
                return _send(handler, 200, result)
            except RuntimeError:
                return _error(handler, 503, 'verification_unavailable', '登录人机验证尚未配置，请联系管理员', request_id)
            except (OSError, ValueError):
                return _error(handler, 502, 'verification_unavailable', '人机验证服务暂时不可用，请重新验证', request_id)
        if path == "/api/v1/admin-app/auth/login":
            if not _require_rate(handler, request_id, "login", 10, 300):
                return
            data = _read_json(handler)
            try:
                verified = login_security.native_before_login(handler, data, _db)
            except RuntimeError:
                return _error(handler, 503, "verification_unavailable", "登录人机验证尚未配置，请联系管理员", request_id, captcha_required=True)
            except (OSError, ValueError):
                return _error(handler, 502, "verification_unavailable", "人机验证服务暂时不可用，请重新验证", request_id, captcha_required=True)
            if not verified:
                return _error(handler, 403, "verification_required", "密码已连续输错两次，请先完成 Cloudflare 人机验证", request_id, captcha_required=True)
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
                        handler, 401, "invalid_credentials", "用户名或密码不正确", request_id,
                        **login_security.native_policy(_db)
                    )
                if legacy_ok:
                    salt = secrets.token_bytes(24)
                    connection.execute(
                        "UPDATE admins SET salt=?,password_hash=? WHERE id=1",
                        (salt, _password_hash(password, salt, PASSWORD_ITERATIONS)),
                    )
                tokens = _new_session(connection)
                _audit(connection, "login", request_id, "session")
                login_security.native_success(connection)
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
        if _dispatch_notes(handler, path):
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

        if path == "/api/v1/admin-app/account/password":
            if not _require_rate(handler, request_id, "password_change", 5, 600):
                return
            data = _read_json(handler)
            current_password = str(data.get("current_password", ""))
            new_password = str(data.get("new_password", ""))
            if len(new_password) < 12 or len(new_password) > 256:
                raise ValueError("新密码须为 12 到 256 位")
            with _db() as connection:
                row = connection.execute(
                    "SELECT salt,password_hash FROM admins WHERE id=1"
                ).fetchone()
                if not row or not any(
                    hmac.compare_digest(
                        _password_hash(current_password, row["salt"], iterations),
                        row["password_hash"],
                    )
                    for iterations in (PASSWORD_ITERATIONS, LEGACY_PASSWORD_ITERATIONS)
                ):
                    return _error(handler, 401, "invalid_credentials", "当前密码不正确", request_id)
                salt = secrets.token_bytes(24)
                connection.execute(
                    "UPDATE admins SET salt=?,password_hash=? WHERE id=1",
                    (salt, _password_hash(new_password, salt, PASSWORD_ITERATIONS)),
                )
                connection.execute("DELETE FROM admin_app_sessions")
                connection.execute("DELETE FROM sessions")
                _audit(connection, "change_password", request_id, "account")
            return _send(handler, 200, {"ok": True})

        if path == "/api/v1/admin-app/pet/presets":
            data = _read_json(handler)
            with _db() as connection:
                result = desktop_pet.preset_add(connection, data)
                _audit(connection, "create", request_id, "pet_preset")
            return _send(handler, 200, result)
        if path == "/api/v1/admin-app/pet/presets/delete":
            data = _read_json(handler)
            identifier = str(data.get("id", ""))
            if not re.fullmatch(r"[0-9a-f]{32}", identifier):
                raise ValueError("预设标识无效")
            with _db() as connection:
                connection.execute("DELETE FROM desktop_pet_presets WHERE id=?", (identifier,))
                _audit(connection, "delete", request_id, "pet_preset", identifier)
                result = {"ok": True, "presets": desktop_pet.presets_read(connection)}
            return _send(handler, 200, result)

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
                    "仅支持 JPG、PNG、WebP、GIF、MP4、WebM 或 MP3",
                    request_id,
                )
            try:
                length = int(handler.headers.get("Content-Length", "0"))
            except ValueError:
                length = 0
            size_limit = 5 * 1024 * 1024 if content_type.startswith("image/") else 12 * 1024 * 1024
            if length <= 0 or length > min(size_limit, MAX_UPLOAD_BODY):
                return _error(
                    handler, 413, "file_too_large", "文件为空或超过该类型大小限制", request_id
                )
            raw = handler.rfile.read(length)
            if len(raw) != length:
                return _error(
                    handler, 400, "incomplete_upload", "文件上传不完整", request_id
                )
            signatures_ok = {
                "image/jpeg": raw.startswith(b"\xff\xd8\xff"),
                "image/png": raw.startswith(b"\x89PNG\r\n\x1a\n"),
                "image/webp": len(raw) >= 12 and raw[:4] == b"RIFF" and raw[8:12] == b"WEBP",
                "image/gif": raw.startswith((b"GIF87a", b"GIF89a")),
                "video/mp4": len(raw) >= 12 and raw[4:8] == b"ftyp",
                "video/webm": raw.startswith(b"\x1a\x45\xdf\xa3"),
                "audio/mpeg": raw.startswith(b"ID3") or (len(raw) >= 2 and raw[0] == 0xff and raw[1] & 0xe0 == 0xe0),
            }
            if not signatures_ok.get(content_type, False):
                return _error(handler, 400, "invalid_media", "文件内容与类型不一致", request_id)
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
                    "url,thumbnail_url,video_url,title,meta,body,taken_at,sort_order,sort_manual,"
                    "show_on_home,show_in_3d,show_in_stories,created_at"
                    ") VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)",
                    (
                        payload["url"],
                        payload["thumbnail_url"],
                        payload["video_url"],
                        payload["title"],
                        payload["meta"],
                        payload["body"],
                        payload["taken_at"],
                        next_order,
                        1 if payload["sort_order"] else 0,
                        payload["show_on_home"],
                        payload["show_in_3d"],
                        payload["show_in_stories"],
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
    if _dispatch_notes(handler, path):
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
                    "UPDATE media SET url=?,thumbnail_url=?,video_url=?,title=?,meta=?,body=?,taken_at=?,"
                    "sort_manual=?,show_on_home=?,show_in_3d=?,show_in_stories=? WHERE id=?",
                    (
                        payload["url"],
                        payload["thumbnail_url"],
                        payload["video_url"],
                        payload["title"],
                        payload["meta"],
                        payload["body"],
                        payload["taken_at"],
                        1 if payload["sort_order"] else 0,
                        payload["show_on_home"],
                        payload["show_in_3d"],
                        payload["show_in_stories"],
                        media_id,
                    ),
                )
                _reposition_media(connection, media_id, payload["sort_order"])
                _audit(connection, "update", request_id, "media", media_id)
                connection.commit()
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
                home_visual_assets = {
                    "home_profile_avatar", "home_background_url", "home_hero_image", "about_page_image", "home_card_story_image", "home_card_memory_image",
                    "home_card_timeline_image", "home_card_campus_image", "home_card_notes_image",
                    "home_card_about_image", "home_card_messages_image",
                }
                for key, value in data.items():
                    if key not in ALLOWED_SETTINGS:
                        continue
                    if key in {"home_card_aspects", "home_card_crops"}:
                        host = sys.modules[type(handler).__module__]
                        value = getattr(host, "sanitize_" + key)(value)
                    elif key in {"display_font_scale", "display_media_scale"}:
                        value = str(value) if str(value) in {"80", "90", "100", "110", "120"} else "100"
                    elif key == "hero_art_style":
                        value = str(value) if str(value) in {"editorial", "dreamy", "cinematic"} else "editorial"
                    elif key == "hero_motion_level":
                        value = str(value) if str(value) in {"quiet", "balanced", "vivid"} else "balanced"
                    elif key == "hero_show_captions" or key.endswith("_extra_enabled"):
                        value = str(_bool_int(value))
                    elif key.endswith("_title_size"):
                        value = str(value) if str(value) in {"small", "standard", "large"} else "standard"
                    elif key.endswith("_title_weight"):
                        value = str(value) if str(value) in {"regular", "medium", "bold"} else "medium"
                    elif key == "home_background_tone":
                        value = str(value) if str(value) in {"archive", "midnight", "lake", "sunset"} else "archive"
                    elif key == "home_card_tone":
                        value = str(value) if str(value) in {"youth", "sky", "peach", "lavender"} else "youth"
                    elif key == "home_card_aspect_ratio":
                        value = str(value) if str(value) in {"14:9", "3:2", "4:3"} else "14:9"
                    elif key == "home_card_order":
                        try:
                            parsed_order = json.loads(value) if isinstance(value, str) else value
                        except (TypeError, ValueError):
                            parsed_order = []
                        clean_order = []
                        if isinstance(parsed_order, list):
                            for card_key in parsed_order:
                                if isinstance(card_key, str) and card_key in HOME_CARD_ORDER_KEYS and card_key not in clean_order:
                                    clean_order.append(card_key)
                        value = json.dumps(clean_order + [card_key for card_key in HOME_CARD_ORDER_KEYS if card_key not in clean_order], separators=(",", ":"))
                    elif key == "home_card_visibility":
                        try:
                            parsed_visibility = json.loads(value) if isinstance(value, str) else value
                        except (TypeError, ValueError):
                            parsed_visibility = {}
                        if not isinstance(parsed_visibility, dict):
                            parsed_visibility = {}
                        clean_visibility = {
                            card_key: _bool_int(parsed_visibility[card_key])
                            for card_key in HOME_CARD_ORDER_KEYS if card_key in parsed_visibility
                        }
                        for card_key in reversed(HOME_CARD_ORDER_KEYS):
                            if sum(clean_visibility.get(card, 1) for card in HOME_CARD_ORDER_KEYS) >= 4:
                                break
                            if clean_visibility.get(card_key) == 0:
                                clean_visibility[card_key] = 1
                        value = json.dumps(clean_visibility, separators=(",", ":"))
                    elif key in {"home_background_color", "home_accent_color", "home_card_tone_color", "galaxy_photo_border_color"}:
                        defaults = {"home_background_color": "#071f24", "home_accent_color": "#baff67", "home_card_tone_color": "#123b3b", "galaxy_photo_border_color": "#242b30"}
                        value = str(value).lower() if re.fullmatch(r"#[0-9a-fA-F]{6}", str(value)) else defaults[key]
                    elif key == "home_background_blur":
                        try:
                            value = str(max(0, min(30, int(float(value)))))
                        except (TypeError, ValueError):
                            value = "8"
                    elif key == "music_default_volume":
                        try:
                            value = str(max(0, min(100, round(float(value)))))
                        except (TypeError, ValueError):
                            value = "35"
                    elif key == "music_playlist":
                        value = _sanitize_music_playlist(value)
                    elif key == "galaxy_scene_preset":
                        value = str(value) if str(value) in {"snow-orbit", "cosmos", "snowfall"} else "snow-orbit"
                    elif key in {"galaxy_particle_density", "galaxy_snow_density", "galaxy_particle_brightness"}:
                        try:
                            value = str(max(0, min(140, int(float(value)))))
                        except (TypeError, ValueError):
                            value = "100"
                    elif key == "galaxy_growth_duration":
                        try:
                            value = f"{max(1.5, min(12.0, float(value))):.2f}".rstrip("0").rstrip(".")
                        except (TypeError, ValueError):
                            value = "4"
                    elif key == "galaxy_photo_scale":
                        try:
                            value = str(max(35, min(130, int(float(value)))))
                        except (TypeError, ValueError):
                            value = "70"
                    elif key == "galaxy_photo_spread":
                        try:
                            value = str(max(70, min(180, int(float(value)))))
                        except (TypeError, ValueError):
                            value = "115"
                    elif key in {"home_background_overlay_opacity", "home_card_surface_opacity", "home_card_image_overlay_opacity"}:
                        try:
                            value = str(max(0, min(90, int(float(value)))))
                        except (TypeError, ValueError):
                            defaults = {"home_background_overlay_opacity": "28", "home_card_surface_opacity": "62", "home_card_image_overlay_opacity": "42"}
                            value = defaults[key]
                    elif key in home_visual_assets:
                        normalized = str(value or "").strip()
                        if normalized not in {"", "none"} and not re.fullmatch(r"/(?:assets|uploads)/[A-Za-z0-9._~!$&'()*+,;=:@%/-]+", normalized) and not re.fullmatch(r"https://[A-Za-z0-9.-]+(?:/[^\s\"'<>]*)?", normalized):
                            normalized = ""
                        value = normalized
                    elif key == "contact_douyin_url":
                        value = str(value).strip()[:500] if re.fullmatch(r"https://[^\s\"'<>]+", str(value).strip(), re.IGNORECASE) else ""
                    elif key == "contact_custom_links":
                        try:
                            parsed_links = json.loads(value) if isinstance(value, str) else value
                        except (TypeError, ValueError):
                            parsed_links = []
                        clean_links = []
                        if isinstance(parsed_links, list):
                            for item in parsed_links[:12]:
                                if not isinstance(item, dict):
                                    continue
                                label = str(item.get("label", "")).strip()[:32]
                                url = str(item.get("url", "")).strip()[:500]
                                try:
                                    parsed_url = urlparse(url)
                                    valid_url = parsed_url.hostname and not parsed_url.username and not parsed_url.password
                                except ValueError:
                                    valid_url = False
                                if label and re.fullmatch(r"https://[^\s\"'<>]+", url, re.IGNORECASE) and valid_url:
                                    clean_links.append({"label": label, "url": url})
                        value = json.dumps(clean_links, ensure_ascii=False, separators=(",", ":"))
                    limit = 12000 if key in {"timeline_items", "music_playlist", "home_card_crops"} else 8000 if key == "contact_custom_links" else 2000
                    if len(str(value)) > limit:
                        raise ValueError("设置内容过长，请缩短后重试")
                    connection.execute(
                        "INSERT INTO settings(key,value) VALUES(?,?) "
                        "ON CONFLICT(key) DO UPDATE SET value=excluded.value",
                        (key, str(value)[:limit]),
                    )
                    changed.append(key)
                _audit(connection, "update", request_id, "settings", ",".join(changed))
                connection.commit()
                return _send(handler, 200, {"ok": True, "changed": changed})
            if path == "/api/v1/admin-app/pet":
                result = desktop_pet.save(connection, data)
                _audit(connection, "update", request_id, "pet")
                connection.commit()
                return _send(handler, 200, result)
            if path == "/api/v1/admin-app/homepage-intro":
                settings = data.get("settings")
                nodes = data.get("nodes")
                if not isinstance(settings, dict) or not isinstance(nodes, list):
                    raise ValueError("开场设置格式无效")
                limits = {
                    "intro_logo": 500,
                    "intro_title": 80,
                    "intro_subtitle": 120,
                    "intro_background_image": 500,
                    "intro_background_desktop_image": 500,
                    "intro_background_mobile_image": 500,
                    "intro_watermark_1": 32,
                    "intro_watermark_2": 32,
                }
                clean_settings = {
                    key: str(settings.get(key, INTRO_SETTING_DEFAULTS[key])).strip()[:limit]
                    for key, limit in limits.items()
                }
                for asset_key in ("intro_logo", "intro_background_image", "intro_background_desktop_image", "intro_background_mobile_image"):
                    value = clean_settings[asset_key]
                    if value and not value.startswith(("/assets/", "/uploads/")):
                        raise ValueError("开场图片必须使用本站上传地址")
                clean_settings["intro_enabled"] = "0" if str(settings.get("intro_enabled", "1")).lower() in {"0", "false", "off"} else "1"
                clean_settings["intro_show_enter_button"] = "0" if str(settings.get("intro_show_enter_button", "1")).lower() in {"0", "false", "off"} else "1"
                try:
                    duration = int(settings.get("intro_loading_duration", 6000))
                except (TypeError, ValueError) as exc:
                    raise ValueError("Loading 时长必须是整数") from exc
                clean_settings["intro_loading_duration"] = str(max(3000, min(10000, duration)))
                crop_ranges = {
                    "intro_background_desktop_x": (0, 100),
                    "intro_background_desktop_y": (0, 100),
                    "intro_background_desktop_zoom": (100, 400),
                    "intro_background_mobile_x": (0, 100),
                    "intro_background_mobile_y": (0, 100),
                    "intro_background_mobile_zoom": (100, 400),
                    "intro_background_blur": (0, 20),
                    "intro_background_brightness": (70, 125),
                    "intro_background_overlay": (0, 100),
                    "intro_watermark_opacity": (0, 30),
                }
                for key, (minimum, maximum) in crop_ranges.items():
                    try:
                        crop_value = float(settings.get(key, INTRO_SETTING_DEFAULTS[key]))
                    except (TypeError, ValueError) as exc:
                        raise ValueError("背景裁切参数无效") from exc
                    clean_settings[key] = f"{max(minimum, min(maximum, crop_value)):g}"
                optional_crop_ranges = {
                    f"intro_background_{viewport}_crop_{axis}": (1 if axis in {"width", "height"} else 0, 100)
                    for viewport in ("desktop", "mobile")
                    for axis in ("left", "top", "width", "height")
                }
                for key, (minimum, maximum) in optional_crop_ranges.items():
                    raw = str(settings.get(key, "")).strip()
                    if not raw:
                        clean_settings[key] = ""
                        continue
                    try:
                        crop_value = float(raw)
                    except (TypeError, ValueError) as exc:
                        raise ValueError("自由裁切参数无效") from exc
                    clean_settings[key] = f"{max(minimum, min(maximum, crop_value)):g}"
                for viewport in ("desktop", "mobile"):
                    clean_settings[f"intro_background_{viewport}_ratio_locked"] = str(
                        _bool_int(settings.get(f"intro_background_{viewport}_ratio_locked", "1"))
                    )
                    keys = [f"intro_background_{viewport}_crop_{axis}" for axis in ("left", "top", "width", "height")]
                    left_key, top_key, width_key, height_key = keys
                    if clean_settings[width_key] and clean_settings[height_key]:
                        left = min(float(clean_settings[left_key] or 0), 99)
                        top = min(float(clean_settings[top_key] or 0), 99)
                        width = min(float(clean_settings[width_key]), 100 - left)
                        height = min(float(clean_settings[height_key]), 100 - top)
                        clean_settings[left_key] = f"{left:g}"
                        clean_settings[top_key] = f"{top:g}"
                        clean_settings[width_key] = f"{max(1, width):g}"
                        clean_settings[height_key] = f"{max(1, height):g}"
                clean_nodes = []
                for index, node in enumerate(nodes[:12], start=1):
                    if not isinstance(node, dict):
                        continue
                    title = str(node.get("title", "")).strip()[:24]
                    subtitle = str(node.get("subtitle", "")).strip()[:40].upper()
                    if not title and not subtitle:
                        continue
                    enabled = 0 if str(node.get("enabled", "1")).lower() in {"0", "false", "off"} else 1
                    clean_nodes.append((title, subtitle, index, enabled))
                for key, value in clean_settings.items():
                    connection.execute(
                        "INSERT INTO settings(key,value) VALUES(?,?) "
                        "ON CONFLICT(key) DO UPDATE SET value=excluded.value",
                        (key, value),
                    )
                connection.execute("DELETE FROM homepage_intro_nodes")
                connection.executemany(
                    "INSERT INTO homepage_intro_nodes(title,subtitle,sort_order,enabled) VALUES(?,?,?,?)",
                    clean_nodes,
                )
                _audit(connection, "update", request_id, "homepage_intro", len(clean_nodes))
                return _send(handler, 200, {"ok": True, "nodes": len(clean_nodes)})
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
    if _dispatch_notes(handler, path):
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
