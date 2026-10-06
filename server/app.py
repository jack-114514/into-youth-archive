#!/usr/bin/env python3
import base64
import hashlib
import hmac
import json
import math
import os
import re
import secrets
import shutil
import smtplib
import sqlite3
import time
import uuid
from datetime import datetime, timezone
from email.message import EmailMessage
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlencode, urlparse
from urllib.request import Request, urlopen

try:
    import notes, media_thumbnails
except ModuleNotFoundError:
    from server import notes, media_thumbnails

try:
    import desktop_pet
except ModuleNotFoundError:
    from server import desktop_pet

try:
    from admin_app_api import (
        dispatch_delete as dispatch_admin_app_delete,
        dispatch_get as dispatch_admin_app_get,
        dispatch_patch as dispatch_admin_app_patch,
        dispatch_post as dispatch_admin_app_post,
        initialize_admin_app_api,
    )
except ModuleNotFoundError:
    from server.admin_app_api import (
        dispatch_delete as dispatch_admin_app_delete,
        dispatch_get as dispatch_admin_app_get,
        dispatch_patch as dispatch_admin_app_patch,
        dispatch_post as dispatch_admin_app_post,
        initialize_admin_app_api,
    )

DATA_DIR = Path(os.environ.get("SITE_DATA_DIR", "/opt/memory-archive/data"))
UPLOAD_DIR = Path(os.environ.get("SITE_UPLOAD_DIR", "/opt/memory-archive/uploads"))
DB_PATH = DATA_DIR / "site.db"
PROCESS_STARTED_AT = time.time()
MAX_BODY = 18 * 1024 * 1024
PASSWORD_ITERATIONS = 600_000
LEGACY_PASSWORD_ITERATIONS = 240_000
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
INTRO_DEFAULT_NODES = (
    ("入学", "ARRIVAL", 1, 1),
    ("军训", "TRAINING", 2, 1),
    ("社团", "COMMUNITY", 3, 1),
    ("毕业", "GRADUATION", 4, 1),
)
HOME_COPY_DEFAULTS = {
    "home_hero_kicker": "MEMORIES WE SHARE",
    "home_hero_title": "把青春留在",
    "home_hero_accent": "风经过的地方",
    "home_hero_subtitle": "这里收藏校园里的日常、朋友、黄昏与心事。\n愿每一次打开，都像重新走进那年夏天。",
    "home_hero_extra_text": "写给正在发光的我们。",
    "home_hero_extra_enabled": "0",
    "home_hero_title_size": "standard",
    "home_hero_title_weight": "medium",
    "home_stories_kicker": "MEMORY ARCHIVE",
    "home_stories_title": "记忆有自己的",
    "home_stories_accent": "显影方式",
    "home_stories_subtitle": "没有宏大的故事，只有被认真收藏的普通日子。每一张照片，都是时间偷偷留下的证词。",
    "home_stories_extra_text": "每一次快门，都是一次郑重的保存。",
    "home_stories_extra_enabled": "0",
    "home_stories_title_size": "standard",
    "home_stories_title_weight": "medium",
    "home_portal_kicker": "IMMERSIVE ARCHIVE",
    "home_portal_title": "照片不会停在相框里，",
    "home_portal_accent": "它们会沿着时间继续发光。",
    "home_portal_subtitle": "移动鼠标探索另一层光景，再走进原创的 3D 青春时间河。",
    "home_portal_extra_text": "从一个瞬间，走进整段青春。",
    "home_portal_extra_enabled": "0",
    "home_portal_title_size": "standard",
    "home_portal_title_weight": "regular",
    "home_campus_kicker": "CAMPUS FRAGMENTS",
    "home_campus_title": "那些被定格的",
    "home_campus_accent": "校园片段",
    "home_campus_subtitle": "这里集中展示后台已有的校园影像，不在首页重复铺开。",
    "home_campus_extra_text": "",
    "home_campus_extra_enabled": "0",
    "home_campus_title_size": "standard",
    "home_campus_title_weight": "medium",
    "home_timeline_kicker": "MOMENTS",
    "home_timeline_title": "一些不舍得",
    "home_timeline_accent": "忘记的片段",
    "home_timeline_subtitle": "",
    "home_timeline_extra_text": "把时间写成可以回看的章节。",
    "home_timeline_extra_enabled": "0",
    "home_timeline_title_size": "standard",
    "home_timeline_title_weight": "medium",
    "home_about_kicker": "ABOUT THE AUTHOR",
    "home_about_title": "你好，我是这个故事的",
    "home_about_accent": "记录者。",
    "home_about_subtitle": "一个正在校园里认真生活的普通人。喜欢傍晚六点的风、窗边的位置，还有把一闪而过的瞬间变成很久很久的记忆。",
    "home_about_extra_text": "慢慢记录，也认真生活。",
    "home_about_extra_enabled": "0",
    "home_about_title_size": "standard",
    "home_about_title_weight": "medium",
    "home_comments_kicker": "LEAVE A TRACE",
    "home_comments_title": "来过的话，",
    "home_comments_accent": "留下一点声音吧",
    "home_comments_subtitle": "陌生人的一句话，也可能成为某一天的好心情。\n这里没有标准答案，真诚就好。",
    "home_comments_extra_text": "你留下的每句话，都会被认真看见。",
    "home_comments_extra_enabled": "0",
    "home_comments_title_size": "standard",
    "home_comments_title_weight": "medium",
}
HOME_VISUAL_DEFAULTS = {
    "home_profile_avatar": "",
    "home_background_tone": "archive",
    "home_background_color": "#071f24",
    "home_accent_color": "#baff67",
    "home_background_overlay_opacity": "28",
    "home_background_blur": "8",
    "home_background_url": "",
    "home_hero_image": "",
    "about_page_image": "",
    "home_hero_caption_kicker": "CAMPUS · FRIENDS · SUNSET",
    "home_hero_caption_title": "",
    "home_card_tone": "youth",
    "home_card_tone_color": "#123b3b",
    "home_card_surface_opacity": "62",
    "home_card_image_overlay_opacity": "42",
    "home_card_aspect_ratio": "14:9",
    "home_card_aspects": "{}",
    "home_card_crops": "{}",
    "home_card_visibility": "{}",
    "home_card_order": "[]",
    "home_card_story_image": "",
    "home_card_memory_image": "",
    "home_card_timeline_image": "",
    "home_card_campus_image": "",
    "home_card_notes_image": "",
    "home_card_about_image": "",
    "home_card_messages_image": "",
}
HOME_VISUAL_ASSET_KEYS = {
    "home_profile_avatar",
    "home_background_url",
    "home_hero_image",
    "about_page_image",
    "home_card_story_image",
    "home_card_memory_image",
    "home_card_timeline_image",
    "home_card_campus_image",
    "home_card_notes_image",
    "home_card_about_image",
    "home_card_messages_image",
}

HOME_VISUAL_OPACITY_KEYS = {"home_background_overlay_opacity", "home_card_surface_opacity", "home_card_image_overlay_opacity"}
HOME_CARD_VISIBILITY_KEYS = (
    "home_card_story_image", "home_card_memory_image", "home_card_timeline_image",
    "home_card_campus_image", "home_card_notes_image", "home_card_about_image",
    "home_card_messages_image",
)


def sanitize_home_card_visibility(value):
    try:
        parsed = json.loads(value) if isinstance(value, str) else value
    except (TypeError, ValueError):
        return "{}"
    if not isinstance(parsed, dict):
        return "{}"
    clean = {key: 0 if str(parsed[key]).lower() in {"0", "false", "off"} else 1
             for key in HOME_CARD_VISIBILITY_KEYS if key in parsed}
    for key in reversed(HOME_CARD_VISIBILITY_KEYS):
        if sum(clean.get(card, 1) for card in HOME_CARD_VISIBILITY_KEYS) >= 4:
            break
        if clean.get(key) == 0:
            clean[key] = 1
    return json.dumps(clean, separators=(",", ":"))


def sanitize_home_card_order(value):
    try:
        parsed = json.loads(value) if isinstance(value, str) else value
    except (TypeError, ValueError):
        parsed = []
    ordered = []
    if isinstance(parsed, list):
        for key in parsed:
            if isinstance(key, str) and key in HOME_CARD_VISIBILITY_KEYS and key not in ordered:
                ordered.append(key)
    return json.dumps(ordered + [key for key in HOME_CARD_VISIBILITY_KEYS if key not in ordered], separators=(",", ":"))


def sanitize_custom_contact_links(value):
    try:
        parsed = json.loads(value) if isinstance(value, str) else value
    except (TypeError, ValueError):
        parsed = []
    if not isinstance(parsed, list):
        return "[]"
    clean = []
    for item in parsed[:12]:
        if not isinstance(item, dict):
            continue
        label = str(item.get("label", "")).strip()[:32]
        url = str(item.get("url", "")).strip()[:500]
        if not label or not re.fullmatch(r"https://[^\s\"'<>]+", url, re.IGNORECASE):
            continue
        try:
            parsed_url = urlparse(url)
            valid_url = parsed_url.scheme.lower() == "https" and parsed_url.hostname and not parsed_url.username and not parsed_url.password
        except ValueError:
            valid_url = False
        if not valid_url:
            continue
        clean.append({"label": label, "url": url})
    return json.dumps(clean, ensure_ascii=False, separators=(",", ":"))


def sanitize_home_card_crops(value):
    try:
        parsed = json.loads(value) if isinstance(value, str) else value
    except (TypeError, ValueError):
        return "{}"
    if not isinstance(parsed, dict):
        return "{}"
    allowed = HOME_VISUAL_ASSET_KEYS - {"home_profile_avatar", "home_background_url", "home_hero_image", "about_page_image"}
    clean = {}
    for key, crop in parsed.items():
        if key not in allowed or not isinstance(crop, dict):
            continue
        try:
            left, top, width, height = (float(crop[name]) for name in ("left", "top", "width", "height"))
        except (KeyError, TypeError, ValueError):
            continue
        if not all(math.isfinite(number) for number in (left, top, width, height)):
            continue
        if not (0 <= left < 100 and 0 <= top < 100 and 1 <= width <= 100 - left and 1 <= height <= 100 - top):
            continue
        clean[key] = {"left": round(left, 2), "top": round(top, 2), "width": round(width, 2), "height": round(height, 2)}
    return json.dumps(clean, separators=(",", ":"))


def sanitize_home_card_aspects(value):
    try:
        parsed = json.loads(value) if isinstance(value, str) else value
    except (TypeError, ValueError):
        return "{}"
    if not isinstance(parsed, dict):
        return "{}"
    allowed = HOME_VISUAL_ASSET_KEYS - {"home_profile_avatar", "home_background_url", "home_hero_image", "about_page_image"}
    clean = {key: ratio for key, ratio in parsed.items() if key in allowed and isinstance(ratio, str) and ratio in {"14:9", "3:2", "4:3"}}
    return json.dumps(clean, separators=(",", ":"))


def sanitize_music_playlist(value):
    try:
        parsed = json.loads(value) if isinstance(value, str) else value
    except (TypeError, ValueError):
        return "[]"
    if not isinstance(parsed, list):
        return "[]"
    clean = []
    for index, track in enumerate(parsed[:20]):
        if not isinstance(track, dict):
            continue
        name = re.sub(r"[\x00-\x1f\x7f]", "", str(track.get("name", ""))).strip()[:80]
        url = str(track.get("url", "")).strip()[:500]
        if not re.fullmatch(r"/uploads/[A-Za-z0-9._~!$&'()*+,;=:@%/-]+\.mp3", url, re.IGNORECASE):
            continue
        track_id = re.sub(r"[^A-Za-z0-9_-]", "", str(track.get("id", "")))[:80] or f"track-{index + 1}"
        clean.append({"id": track_id, "name": name or f"歌曲 {index + 1}", "url": url})
    return json.dumps(clean, ensure_ascii=False, separators=(",", ":"))


def now_iso():
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def sanitize_home_visual_asset(value):
    normalized = str(value or "").strip()
    if normalized in {"", "none"}:
        return normalized
    if re.fullmatch(r"/(?:assets|uploads)/[A-Za-z0-9._~!$&'()*+,;=:@%/-]+", normalized):
        return normalized
    if re.fullmatch(r"https://[A-Za-z0-9.-]+(?:/[^\s\"'<>]*)?", normalized):
        return normalized
    return ""


def db():
    connection = sqlite3.connect(DB_PATH, timeout=10)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    connection.execute("PRAGMA journal_mode = WAL")
    return connection


def read_server_memory():
    """Return Linux memory totals without adding a runtime dependency."""
    try:
        values = {}
        for line in Path("/proc/meminfo").read_text(encoding="utf-8").splitlines():
            key, _, raw_value = line.partition(":")
            if key in {"MemTotal", "MemAvailable"}:
                values[key] = int(raw_value.strip().split()[0]) * 1024
        total = values.get("MemTotal", 0)
        available = values.get("MemAvailable", 0)
        if total <= 0:
            return {"total_bytes": 0, "available_bytes": 0, "used_percent": None}
        return {
            "total_bytes": total,
            "available_bytes": available,
            "used_percent": round((total - available) / total * 100, 1),
        }
    except (OSError, ValueError, IndexError):
        return {"total_bytes": 0, "available_bytes": 0, "used_percent": None}


def directory_file_bytes(path):
    if not path.exists():
        return 0
    total = 0
    try:
        items = path.rglob("*")
        for item in items:
            try:
                if item.is_file():
                    total += item.stat().st_size
            except OSError:
                continue
    except OSError:
        return total
    return total


def build_admin_server_status(connection):
    upload_bytes = directory_file_bytes(UPLOAD_DIR)
    disk_target = DATA_DIR if DATA_DIR.exists() else Path.cwd()
    disk = shutil.disk_usage(disk_target)
    page_views = connection.execute("SELECT value FROM site_stats WHERE key='page_views'").fetchone()
    database_updated_at = (
        datetime.fromtimestamp(DB_PATH.stat().st_mtime, timezone.utc).isoformat()
        if DB_PATH.exists()
        else None
    )
    try:
        load_1m = round(os.getloadavg()[0], 2)
    except (AttributeError, OSError):
        load_1m = None
    return {
        "ok": True,
        "server_time": now_iso(),
        "service": {
            "status": "online",
            "started_at": datetime.fromtimestamp(PROCESS_STARTED_AT, timezone.utc).isoformat(),
            "uptime_seconds": max(0, int(time.time() - PROCESS_STARTED_AT)),
            "load_1m": load_1m,
        },
        "database": {
            "status": "connected",
            "size_bytes": DB_PATH.stat().st_size if DB_PATH.exists() else 0,
            "updated_at": database_updated_at,
        },
        "storage": {
            "uploads_bytes": upload_bytes,
            "disk_total_bytes": disk.total,
            "disk_free_bytes": disk.free,
            "disk_used_percent": round((disk.used / disk.total * 100), 1) if disk.total else 0,
        },
        "memory": read_server_memory(),
        "counts": {
            "media": connection.execute("SELECT COUNT(*) FROM media").fetchone()[0],
            "comments": connection.execute("SELECT COUNT(*) FROM comments").fetchone()[0],
            "visible_comments": connection.execute(
                "SELECT COUNT(*) FROM comments WHERE status='visible'"
            ).fetchone()[0],
            "submissions": connection.execute("SELECT COUNT(*) FROM submissions").fetchone()[0],
            "pending_submissions": connection.execute(
                "SELECT COUNT(*) FROM submissions WHERE status='pending'"
            ).fetchone()[0],
            "page_views": page_views["value"] if page_views else 0,
        },
    }


def password_hash(password, salt, iterations=PASSWORD_ITERATIONS):
    return hashlib.pbkdf2_hmac("sha256", password.encode(), salt, iterations)


def verification_code_hash(code):
    pepper = os.environ.get("PASSWORD_CODE_PEPPER", "")
    if not pepper:
        raise RuntimeError("验证码安全密钥尚未配置")
    return hmac.new(pepper.encode(), code.encode(), hashlib.sha256).hexdigest()


def send_verification_code(recipient, code):
    host = os.environ.get("SMTP_HOST", "smtp.gmail.com")
    port = int(os.environ.get("SMTP_PORT", "465"))
    username = os.environ.get("SMTP_USERNAME", "")
    password = os.environ.get("SMTP_PASSWORD", "")
    sender = os.environ.get("SMTP_FROM", username)
    if not username or not password or not sender:
        raise RuntimeError("邮件服务尚未配置")
    message = EmailMessage()
    message["Subject"] = "我的记忆档案：管理员密码修改验证码"
    message["From"] = sender
    message["To"] = recipient
    message.set_content(
        f"你的管理员密码修改验证码是：{code}\n\n"
        "验证码 10 分钟内有效。若不是你本人操作，请忽略此邮件并检查后台账号安全。"
    )
    security = os.environ.get("SMTP_SECURITY", "ssl" if port == 465 else "starttls").lower()
    if security == "ssl":
        with smtplib.SMTP_SSL(host, port, timeout=15) as smtp:
            smtp.login(username, password)
            smtp.send_message(message)
        return
    with smtplib.SMTP(host, port, timeout=15) as smtp:
        smtp.ehlo()
        smtp.starttls()
        smtp.ehlo()
        smtp.login(username, password)
        smtp.send_message(message)


def verify_turnstile(token, remote_ip):
    secret = os.environ.get("TURNSTILE_SECRET_KEY", "")
    if not secret:
        raise RuntimeError("人机验证服务尚未配置")
    if not token:
        return False
    allowed_hostnames = {
        item.strip().lower()
        for item in os.environ.get("TURNSTILE_ALLOWED_HOSTNAMES", "").split(",")
        if item.strip()
    }
    if not allowed_hostnames:
        raise RuntimeError("TURNSTILE_ALLOWED_HOSTNAMES is required")
    validation_id = str(uuid.uuid4())
    payload = urlencode({
        "secret": secret,
        "response": token,
        "remoteip": remote_ip,
        "idempotency_key": validation_id,
    }).encode()
    result = None
    for attempt in range(2):
        request = Request(
            "https://challenges.cloudflare.com/turnstile/v0/siteverify",
            data=payload,
            headers={"Content-Type": "application/x-www-form-urlencoded"},
            method="POST",
        )
        try:
            with urlopen(request, timeout=12) as response:
                result = json.loads(response.read().decode("utf-8"))
            if not isinstance(result, dict):
                raise ValueError("Invalid Turnstile response")
            break
        except (OSError, ValueError):
            if attempt == 1:
                raise
    return (
        bool(result.get("success"))
        and result.get("action") == "admin_password_recovery"
        and str(result.get("hostname", "")).strip().lower() in allowed_hostnames
    )


def initialize():
    first_install = not DB_PATH.exists()
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    with db() as connection:
        desktop_pet.initialize(connection)
        notes.initialize(connection)
        connection.executescript(
            """
            CREATE TABLE IF NOT EXISTS admins (
              id INTEGER PRIMARY KEY CHECK (id = 1), username TEXT NOT NULL,
              salt BLOB NOT NULL, password_hash BLOB NOT NULL
            );
            CREATE TABLE IF NOT EXISTS sessions (
              token_hash TEXT PRIMARY KEY, expires_at INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS comments (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              parent_id INTEGER REFERENCES comments(id) ON DELETE CASCADE,
              nickname TEXT NOT NULL,
              avatar TEXT NOT NULL,
              text TEXT NOT NULL,
              image TEXT,
              likes INTEGER NOT NULL DEFAULT 0,
              status TEXT NOT NULL DEFAULT 'visible',
              created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS submissions (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              nickname TEXT NOT NULL,
              email TEXT NOT NULL DEFAULT '',
              title TEXT NOT NULL,
              body TEXT NOT NULL,
              image TEXT,
              status TEXT NOT NULL DEFAULT 'pending',
              created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS site_stats (
              key TEXT PRIMARY KEY,
              value INTEGER NOT NULL DEFAULT 0
            );
            CREATE TABLE IF NOT EXISTS media (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              url TEXT NOT NULL,
              thumbnail_url TEXT NOT NULL DEFAULT '',
              video_url TEXT NOT NULL DEFAULT '',
              title TEXT NOT NULL,
              meta TEXT NOT NULL DEFAULT '',
              body TEXT NOT NULL DEFAULT '',
              taken_at TEXT NOT NULL DEFAULT '',
              sort_order INTEGER NOT NULL DEFAULT 0,
              sort_manual INTEGER NOT NULL DEFAULT 0,
              show_on_home INTEGER NOT NULL DEFAULT 1,
              show_in_3d INTEGER NOT NULL DEFAULT 1,
              show_in_stories INTEGER NOT NULL DEFAULT 0,
              created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS settings (
              key TEXT PRIMARY KEY, value TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS password_change_codes (
              id INTEGER PRIMARY KEY CHECK (id = 1),
              code_hash TEXT NOT NULL,
              expires_at INTEGER NOT NULL,
              requested_at INTEGER NOT NULL,
              attempts INTEGER NOT NULL DEFAULT 0
            );
            CREATE TABLE IF NOT EXISTS homepage_intro_nodes (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              title TEXT NOT NULL,
              subtitle TEXT NOT NULL DEFAULT '',
              sort_order INTEGER NOT NULL DEFAULT 0,
              enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1))
            );
            CREATE INDEX IF NOT EXISTS idx_comments_status_created ON comments(status, created_at DESC);
            CREATE INDEX IF NOT EXISTS idx_submissions_status_created ON submissions(status, created_at DESC);
            CREATE INDEX IF NOT EXISTS idx_homepage_intro_nodes_order
              ON homepage_intro_nodes(enabled, sort_order, id);
            """
        )
        admin_columns = {row["name"] for row in connection.execute("PRAGMA table_info(admins)")}
        if "username" not in admin_columns:
            connection.execute("ALTER TABLE admins ADD COLUMN username TEXT NOT NULL DEFAULT ''")
        submission_columns = {row["name"] for row in connection.execute("PRAGMA table_info(submissions)")}
        if "email" not in submission_columns:
            connection.execute("ALTER TABLE submissions ADD COLUMN email TEXT NOT NULL DEFAULT ''")
        connection.execute("INSERT OR IGNORE INTO site_stats(key,value) VALUES('page_views',0)")
        media_columns = {row["name"] for row in connection.execute("PRAGMA table_info(media)")}
        if "thumbnail_url" not in media_columns:
            connection.execute("ALTER TABLE media ADD COLUMN thumbnail_url TEXT NOT NULL DEFAULT ''")
        if "video_url" not in media_columns:
            connection.execute("ALTER TABLE media ADD COLUMN video_url TEXT NOT NULL DEFAULT ''")
        if "body" not in media_columns:
            connection.execute("ALTER TABLE media ADD COLUMN body TEXT NOT NULL DEFAULT ''")
        if "taken_at" not in media_columns:
            connection.execute("ALTER TABLE media ADD COLUMN taken_at TEXT NOT NULL DEFAULT ''")
        added_sort_order = "sort_order" not in media_columns
        if added_sort_order:
            connection.execute("ALTER TABLE media ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0")
            connection.execute(
                "UPDATE media SET sort_order=((SELECT COALESCE(MAX(id),0) FROM media)-id+1)*10"
            )
        if "sort_manual" not in media_columns:
            connection.execute("ALTER TABLE media ADD COLUMN sort_manual INTEGER NOT NULL DEFAULT 0")
        if "show_on_home" not in media_columns:
            connection.execute("ALTER TABLE media ADD COLUMN show_on_home INTEGER NOT NULL DEFAULT 1")
        if "show_in_3d" not in media_columns:
            connection.execute("ALTER TABLE media ADD COLUMN show_in_3d INTEGER NOT NULL DEFAULT 1")
        if "show_in_stories" not in media_columns:
            connection.execute("ALTER TABLE media ADD COLUMN show_in_stories INTEGER NOT NULL DEFAULT 0")
            # Keep currently published story cards visible until the administrator curates them.
            connection.execute("UPDATE media SET show_in_stories=show_on_home")
        ordered_media = connection.execute(
            "SELECT id FROM media ORDER BY sort_order ASC, id ASC"
        ).fetchall()
        for index, row in enumerate(ordered_media, start=1):
            connection.execute("UPDATE media SET sort_order=? WHERE id=?", (index, row["id"]))
        connection.execute("CREATE INDEX IF NOT EXISTS idx_media_order ON media(sort_order, id)")
        admin_username = os.environ.get("ADMIN_USERNAME", "").strip().lower()
        if not admin_username:
            raise RuntimeError("ADMIN_USERNAME is required")
        if connection.execute("SELECT 1 FROM admins WHERE id=1").fetchone() is None:
            initial = os.environ.get("ADMIN_PASSWORD")
            if not initial:
                raise RuntimeError("ADMIN_PASSWORD is required for first start")
            salt = secrets.token_bytes(24)
            connection.execute(
                "INSERT INTO admins(id, username, salt, password_hash) VALUES(1, ?, ?, ?)",
                (admin_username, salt, password_hash(initial, salt)),
            )
        else:
            connection.execute("UPDATE admins SET username=? WHERE id=1", (admin_username,))
        defaults = {
            "site_title": "我的记忆档案",
            "footer_title": "我的记忆档案",
            "footer_subtitle": "",
            "browser_title": "我的记忆档案",
            "site_icon_url": "/favicon.svg",
            "nav_logo_url": "",
            "hero_title": "把青春留在风经过的地方",
            "profile_text": "一个正在校园里认真生活的普通人。喜欢傍晚六点的风、窗边的位置，还有把一闪而过的瞬间变成很久很久的记忆。",
            "hero_primary_button": "开始翻阅",
            "hero_secondary_button": "进入 3D 粒子树",
            "hero_art_style": "editorial",
            "hero_motion_level": "vivid",
            "hero_show_captions": "1",
            "primary_color": "#102d2d",
            "accent_color": "#d9ff80",
            "background_color": "#eff6ed",
            "color_mode": "light",
            "home_background_url": "",
            "home_hero_image": "",
            "home_item_limit": "4",
            "show_stories": "1",
            "show_timeline": "1",
            "show_about": "1",
            "show_comments": "1",
            "corner_radius": "18",
            "glass_opacity": "0.68",
            "motion_intensity": "normal",
            "particle_level": "normal",
            "star_level": "normal",
            "snow_level": "normal",
            "quality_3d": "balanced",
            "auto_rotate_speed": "0.22",
            "galaxy_scene_preset": "snow-orbit",
            "galaxy_particle_density": "70",
            "galaxy_snow_density": "75",
            "galaxy_particle_brightness": "100",
            "galaxy_growth_duration": "4",
            "galaxy_photo_scale": "70",
            "galaxy_photo_spread": "115",
            "galaxy_photo_border_color": "#242b30",
            "music_default_on": "0",
            "music_default_volume": "35",
            "music_playlist": "[]",
            "card_style": "glass",
            "font_preset": "modern",
            "github_url": "",
            "contact_email": "",
            "contact_douyin_url": "",
            "contact_custom_links": "[]",
            "mobile_effect_level": "normal",
            "app_display_name": "我的站点管理",
            "app_logo_url": "",
            "display_font_scale": "100",
            "display_media_scale": "100",
            "notes_title": "随手记",
            "notes_body": "这里会慢慢收集校园里真实发生的片段。",
            "timeline_items": '[{"date":"2023.09","title":"第一次走进这里","text":"风很轻，书包很重，未来还是一张没有写字的纸。"},{"date":"2024.03","title":"春天在操场集合","text":"我们用一整个下午，把笑声留在跑道边。"},{"date":"2025.06","title":"教室最后一排","text":"黑板上的倒计时越来越小，想说的话却越来越多。"},{"date":"NOW","title":"故事仍在继续","text":"今天也值得记录。等未来回头看，它一定很亮。"}]',
            **INTRO_SETTING_DEFAULTS,
            **HOME_COPY_DEFAULTS,
            **HOME_VISUAL_DEFAULTS,
        }
        had_home_copy = connection.execute(
            "SELECT 1 FROM settings WHERE key='home_hero_title'"
        ).fetchone() is not None
        legacy_hero_title = connection.execute(
            "SELECT value FROM settings WHERE key='hero_title'"
        ).fetchone()
        legacy_profile_text = connection.execute(
            "SELECT value FROM settings WHERE key='profile_text'"
        ).fetchone()
        had_desktop_intro_background = connection.execute(
            "SELECT 1 FROM settings WHERE key='intro_background_desktop_image'"
        ).fetchone() is not None
        legacy_intro_background = connection.execute(
            "SELECT value FROM settings WHERE key='intro_background_image'"
        ).fetchone()
        for key, value in defaults.items():
            connection.execute("INSERT OR IGNORE INTO settings(key, value) VALUES(?, ?)", (key, value))
        if not had_desktop_intro_background and legacy_intro_background:
            connection.execute(
                "UPDATE settings SET value=? WHERE key='intro_background_desktop_image'",
                (legacy_intro_background["value"],),
            )
        if not had_home_copy:
            legacy_hero = str(legacy_hero_title["value"] if legacy_hero_title else "").strip()
            hero_title, hero_accent = legacy_hero, ""
            if "风经过" in legacy_hero:
                before, after = legacy_hero.split("风经过", 1)
                hero_title, hero_accent = before, f"风经过{after}"
            if hero_title:
                connection.execute("UPDATE settings SET value=? WHERE key='home_hero_title'", (hero_title,))
            if hero_accent:
                connection.execute("UPDATE settings SET value=? WHERE key='home_hero_accent'", (hero_accent,))
            legacy_profile = str(legacy_profile_text["value"] if legacy_profile_text else "").strip()
            if legacy_profile:
                connection.execute("UPDATE settings SET value=? WHERE key='home_about_subtitle'", (legacy_profile,))
        if connection.execute("SELECT COUNT(*) AS total FROM homepage_intro_nodes").fetchone()["total"] == 0:
            connection.executemany(
                "INSERT INTO homepage_intro_nodes(title,subtitle,sort_order,enabled) VALUES(?,?,?,?)",
                INTRO_DEFAULT_NODES,
            )
        media_thumbnails.backfill(connection, UPLOAD_DIR)
        if first_install and os.environ.get("SEED_DEMO_CONTENT", "1") == "1":
            for index in range(1, 17):
                url = f"/assets/demo-{(index - 1) % 5 + 1}.svg"
                connection.execute(
                    "INSERT INTO media(url,thumbnail_url,title,meta,body,sort_order,show_in_stories,created_at) VALUES(?,?,?,?,?,?,?,?)",
                    (url, url, f"示例记忆 {index:02}", "可在后台替换的演示插画",
                     "这是生成的示例内容，不是真实照片。登录后台上传自己的照片、视频并编辑文案。",
                     index, 1, now_iso()),
                )
        connection.execute("PRAGMA optimize")
    initialize_admin_app_api()


def media_time_key(row):
    value = str(row["taken_at"] or row["created_at"] or "").strip()
    return value.replace("T", " ")


def reposition_media(connection, media_id, requested_position=None):
    rows = list(connection.execute(
        "SELECT id,taken_at,created_at FROM media ORDER BY sort_order ASC, id ASC"
    ).fetchall())
    moving = next((row for row in rows if row["id"] == media_id), None)
    if moving is None:
        return
    rows = [row for row in rows if row["id"] != media_id]
    if requested_position is None:
        moving_key = media_time_key(moving)
        insert_at = len(rows)
        if moving_key:
            for index, row in enumerate(rows):
                row_key = media_time_key(row)
                if row_key and row_key > moving_key:
                    insert_at = index
                    break
    else:
        insert_at = max(0, min(int(requested_position) - 1, len(rows)))
    rows.insert(insert_at, moving)
    for index, row in enumerate(rows, start=1):
        connection.execute("UPDATE media SET sort_order=? WHERE id=?", (index, row["id"]))


class Handler(BaseHTTPRequestHandler):
    server_version = "IntoYouth/1.0"

    def log_message(self, fmt, *args):
        print(f"[{now_iso()}] {self.address_string()} {fmt % args}")

    def send_json(self, status, payload, headers=None):
        encoded = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(encoded)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        for name, value in (headers or {}).items():
            self.send_header(name, value)
        self.end_headers()
        self.wfile.write(encoded)

    def read_json(self):
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            raise ValueError("无效请求")
        if length <= 0 or length > MAX_BODY:
            raise ValueError("请求内容过大或为空")
        try:
            return json.loads(self.rfile.read(length))
        except (json.JSONDecodeError, UnicodeDecodeError):
            raise ValueError("JSON 格式无效")

    def require_admin(self):
        auth = self.headers.get("Authorization", "")
        if not auth.startswith("Bearer "):
            return False
        token_hash = hashlib.sha256(auth[7:].encode()).hexdigest()
        with db() as connection:
            row = connection.execute(
                "SELECT expires_at FROM sessions WHERE token_hash=?", (token_hash,)
            ).fetchone()
            if not row or row["expires_at"] < int(time.time()):
                connection.execute("DELETE FROM sessions WHERE expires_at < ?", (int(time.time()),))
                return False
        return True

    def route(self):
        return urlparse(self.path).path.rstrip("/") or "/"

    def do_GET(self):
        path = self.route()
        if notes.dispatch(self, db, "GET", path):
            return
        if desktop_pet.dispatch(self, db, 'GET', path):
            return
        if path.startswith("/api/v1/admin-app/"):
            return dispatch_admin_app_get(self, path)
        if path == "/api/health":
            return self.send_json(200, {"ok": True, "time": now_iso()})
        if path == "/api/public-config":
            return self.send_json(200, {
                "turnstile_site_key": os.environ.get("TURNSTILE_SITE_KEY", "").strip(),
                "password_recovery_enabled": all(os.environ.get(k, "").strip() for k in (
                    "TURNSTILE_SITE_KEY", "TURNSTILE_SECRET_KEY", "TURNSTILE_ALLOWED_HOSTNAMES",
                    "SMTP_HOST", "SMTP_USERNAME", "SMTP_PASSWORD", "ADMIN_USERNAME",
                    "PASSWORD_CODE_PEPPER",
                )),
            })
        if path == "/api/stats":
            with db() as connection:
                page_views = connection.execute("SELECT value FROM site_stats WHERE key='page_views'").fetchone()
                media_count = connection.execute("SELECT COUNT(*) AS total FROM media").fetchone()
            return self.send_json(200, {
                "page_views": page_views["value"] if page_views else 0,
                "media_count": media_count["total"] if media_count else 0,
                "online": True,
                "updated_at": now_iso(),
            })
        if path == "/api/content":
            with db() as connection:
                settings = {row["key"]: row["value"] for row in connection.execute("SELECT key,value FROM settings")}
                media = [dict(row) for row in connection.execute(
                    "SELECT id,url,thumbnail_url,video_url,title,meta,body,taken_at,sort_order,sort_manual,show_on_home,show_in_3d,show_in_stories,created_at FROM media ORDER BY sort_order ASC, id ASC"
                )]
                intro_nodes = [dict(row) for row in connection.execute(
                    "SELECT id,title,subtitle,sort_order,enabled FROM homepage_intro_nodes "
                    "WHERE enabled=1 ORDER BY sort_order ASC,id ASC"
                )]
            return self.send_json(200, {"settings": settings, "media": media, "intro_nodes": intro_nodes})
        if path == "/api/comments":
            with db() as connection:
                rows = connection.execute(
                    """SELECT c.id,c.parent_id,c.nickname,c.avatar,c.text,c.image,c.likes,c.created_at,
                    p.nickname AS reply_to FROM comments c LEFT JOIN comments p ON p.id=c.parent_id
                    WHERE c.status='visible' ORDER BY c.id DESC LIMIT 200"""
                ).fetchall()
            return self.send_json(200, {"comments": [dict(row) for row in rows]})
        if path.startswith("/api/admin/"):
            if not self.require_admin():
                return self.send_json(401, {"error": "请重新登录"})
            with db() as connection:
                if path == "/api/admin/status":
                    return self.send_json(200, build_admin_server_status(connection))
                if path == "/api/admin/comments":
                    rows = connection.execute("SELECT * FROM comments ORDER BY id DESC LIMIT 500").fetchall()
                    return self.send_json(200, {"comments": [dict(row) for row in rows]})
                if path == "/api/admin/submissions":
                    rows = connection.execute("SELECT * FROM submissions ORDER BY id DESC LIMIT 500").fetchall()
                    return self.send_json(200, {"submissions": [dict(row) for row in rows]})
                if path == "/api/admin/media":
                    rows = connection.execute("SELECT * FROM media ORDER BY sort_order ASC, id ASC").fetchall()
                    return self.send_json(200, {"media": [dict(row) for row in rows]})
                if path == "/api/admin/stories":
                    rows = connection.execute("SELECT * FROM media WHERE show_in_stories=1 ORDER BY sort_order ASC, id ASC").fetchall()
                    return self.send_json(200, {"stories": [dict(row) for row in rows]})
                if path == "/api/admin/homepage-intro":
                    settings = {
                        row["key"]: row["value"]
                        for row in connection.execute(
                            f"SELECT key,value FROM settings WHERE key IN ({','.join('?' for _ in INTRO_SETTING_DEFAULTS)})",
                            tuple(INTRO_SETTING_DEFAULTS),
                        )
                    }
                    nodes = connection.execute(
                        "SELECT id,title,subtitle,sort_order,enabled FROM homepage_intro_nodes "
                        "ORDER BY sort_order ASC,id ASC"
                    ).fetchall()
                    return self.send_json(200, {
                        "settings": {**INTRO_SETTING_DEFAULTS, **settings},
                        "nodes": [dict(row) for row in nodes],
                    })
        return self.send_json(404, {"error": "未找到接口"})

    def do_POST(self):
        path = self.route()
        if notes.dispatch(self, db, "POST", path):
            return
        if desktop_pet.dispatch(self, db, 'POST', path):
            return
        if path.startswith("/api/v1/admin-app/"):
            return dispatch_admin_app_post(self, path)
        try:
            data = self.read_json()
            if path == "/api/admin/login":
                username = str(data.get("username", "")).strip().lower()
                password = str(data.get("password", ""))
                with db() as connection:
                    row = connection.execute("SELECT username,salt,password_hash FROM admins WHERE id=1").fetchone()
                    username_ok = bool(row) and hmac.compare_digest(username, row["username"])
                    password_ok = bool(row) and hmac.compare_digest(password_hash(password, row["salt"]), row["password_hash"])
                    legacy_password_ok = bool(row) and not password_ok and hmac.compare_digest(
                        password_hash(password, row["salt"], LEGACY_PASSWORD_ITERATIONS),
                        row["password_hash"],
                    )
                    password_ok = password_ok or legacy_password_ok
                    if not username_ok or not password_ok:
                        time.sleep(0.35)
                        return self.send_json(401, {"error": "用户名或密码不正确"})
                    if legacy_password_ok:
                        new_salt = secrets.token_bytes(24)
                        connection.execute(
                            "UPDATE admins SET salt=?,password_hash=? WHERE id=1",
                            (new_salt, password_hash(password, new_salt)),
                        )
                    token = secrets.token_urlsafe(36)
                    connection.execute(
                        "INSERT INTO sessions(token_hash,expires_at) VALUES(?,?)",
                        (hashlib.sha256(token.encode()).hexdigest(), int(time.time()) + 86400),
                    )
                return self.send_json(200, {"token": token})
            if path == "/api/admin/password-recovery/code":
                try:
                    human_verified = verify_turnstile(
                        str(data.get("turnstile_token", "")).strip(),
                        self.client_address[0],
                    )
                except RuntimeError as exc:
                    return self.send_json(503, {"error": str(exc)})
                except (OSError, ValueError, json.JSONDecodeError):
                    return self.send_json(502, {"error": "暂时无法完成人机验证，请稍后重试"})
                if not human_verified:
                    return self.send_json(400, {"error": "人机验证未通过，请重新验证"})
                with db() as connection:
                    now = int(time.time())
                    existing = connection.execute(
                        "SELECT requested_at FROM password_change_codes WHERE id=1"
                    ).fetchone()
                    if existing and now - existing["requested_at"] < 60:
                        return self.send_json(429, {"error": "请等待 60 秒后再次发送"})
                    admin = connection.execute("SELECT username FROM admins WHERE id=1").fetchone()
                    if not admin:
                        return self.send_json(503, {"error": "管理员账号尚未配置"})
                    code = f"{secrets.randbelow(1_000_000):06d}"
                    try:
                        send_verification_code(admin["username"], code)
                    except RuntimeError as exc:
                        return self.send_json(503, {"error": str(exc)})
                    except (OSError, smtplib.SMTPException):
                        return self.send_json(502, {"error": "验证码邮件发送失败，请稍后重试"})
                    connection.execute(
                        "INSERT INTO password_change_codes(id,code_hash,expires_at,requested_at,attempts) "
                        "VALUES(1,?,?,?,0) ON CONFLICT(id) DO UPDATE SET "
                        "code_hash=excluded.code_hash,expires_at=excluded.expires_at,"
                        "requested_at=excluded.requested_at,attempts=0",
                        (verification_code_hash(code), now + 600, now),
                    )
                    local, _, domain = admin["username"].partition("@")
                    masked_email = f"{local[:2]}***@{domain}" if domain else "管理员邮箱"
                return self.send_json(200, {"ok": True, "email": masked_email})
            if path == "/api/admin/password-recovery/complete":
                password = str(data.get("password", ""))
                code = str(data.get("code", "")).strip()
                if len(password) < 12:
                    return self.send_json(400, {"error": "新密码至少 12 位"})
                if not re.fullmatch(r"\d{6}", code):
                    return self.send_json(400, {"error": "请输入 6 位邮箱验证码"})
                with db() as connection:
                    verification = connection.execute(
                        "SELECT code_hash,expires_at,attempts FROM password_change_codes WHERE id=1"
                    ).fetchone()
                    if not verification or verification["expires_at"] < int(time.time()):
                        return self.send_json(400, {"error": "验证码已过期，请重新发送"})
                    if verification["attempts"] >= 5:
                        return self.send_json(429, {"error": "验证码错误次数过多，请重新发送"})
                    if not hmac.compare_digest(verification_code_hash(code), verification["code_hash"]):
                        connection.execute("UPDATE password_change_codes SET attempts=attempts+1 WHERE id=1")
                        return self.send_json(400, {"error": "验证码不正确"})
                    salt = secrets.token_bytes(24)
                    connection.execute("UPDATE admins SET salt=?,password_hash=? WHERE id=1", (salt, password_hash(password, salt)))
                    connection.execute("DELETE FROM password_change_codes")
                    connection.execute("DELETE FROM sessions")
                    connection.execute("DELETE FROM admin_app_sessions")
                return self.send_json(200, {"ok": True})
            if path == "/api/upload":
                encoded = str(data.get("data", ""))
                match = re.fullmatch(r"data:(image/(?:jpeg|png|webp|gif)|video/(?:mp4|webm));base64,(.+)", encoded, re.DOTALL)
                if not match:
                    return self.send_json(400, {"error": "仅支持 JPG、PNG、WebP、GIF、MP4 或 WebM"})
                media_type = match.group(1)
                raw = base64.b64decode(match.group(2), validate=True)
                max_size = 12 * 1024 * 1024 if media_type.startswith("video/") else 5 * 1024 * 1024
                if len(raw) > max_size:
                    return self.send_json(413, {"error": "视频不能超过 12MB" if media_type.startswith("video/") else "图片不能超过 5MB"})
                extension = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif", "video/mp4": "mp4", "video/webm": "webm"}[media_type]
                name = f"{int(time.time())}-{secrets.token_hex(8)}.{extension}"
                (UPLOAD_DIR / name).write_bytes(raw)
                return self.send_json(201, {"url": f"/uploads/{name}"})
            if path == "/api/stats/view":
                with db() as connection:
                    connection.execute("UPDATE site_stats SET value=value+1 WHERE key='page_views'")
                    row = connection.execute("SELECT value FROM site_stats WHERE key='page_views'").fetchone()
                return self.send_json(200, {"page_views": row["value"] if row else 1})
            if path == "/api/comments":
                nickname = str(data.get("nickname", "")).strip()[:24]
                avatar = str(data.get("avatar", "🌤️"))[:300]
                text = str(data.get("text", "")).strip()[:500]
                image = str(data.get("image", "")).strip()[:500] or None
                parent_id = data.get("parent_id")
                if not nickname or not text:
                    return self.send_json(400, {"error": "昵称和留言不能为空"})
                with db() as connection:
                    cursor = connection.execute(
                        "INSERT INTO comments(parent_id,nickname,avatar,text,image,created_at) VALUES(?,?,?,?,?,?)",
                        (parent_id, nickname, avatar, text, image, now_iso()),
                    )
                    item = connection.execute("SELECT * FROM comments WHERE id=?", (cursor.lastrowid,)).fetchone()
                return self.send_json(201, {"comment": dict(item)})
            like_match = re.fullmatch(r"/api/comments/(\d+)/like", path)
            if like_match:
                with db() as connection:
                    connection.execute("UPDATE comments SET likes=likes+1 WHERE id=?", (int(like_match.group(1)),))
                    row = connection.execute("SELECT likes FROM comments WHERE id=?", (int(like_match.group(1)),)).fetchone()
                return self.send_json(200, {"likes": row["likes"] if row else 0})
            if path == "/api/submissions":
                nickname = str(data.get("nickname", "匿名访客")).strip()[:24]
                email = str(data.get("email", "")).strip().lower()[:254]
                title = str(data.get("title", "")).strip()[:100]
                body = str(data.get("body", "")).strip()[:3000]
                image = str(data.get("image", "")).strip()[:500] or None
                if not title or not body:
                    return self.send_json(400, {"error": "标题和故事内容不能为空"})
                if email and not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", email):
                    return self.send_json(400, {"error": "请输入有效的联系邮箱"})
                with db() as connection:
                    connection.execute(
                        "INSERT INTO submissions(nickname,email,title,body,image,created_at) VALUES(?,?,?,?,?,?)",
                        (nickname, email, title, body, image, now_iso()),
                    )
                return self.send_json(201, {"ok": True})
            if path.startswith("/api/admin/"):
                if not self.require_admin():
                    return self.send_json(401, {"error": "请重新登录"})
                if path == "/api/admin/intro-upload":
                    encoded = str(data.get("data", ""))
                    match = re.fullmatch(r"data:(image/(?:jpeg|png|webp));base64,(.+)", encoded, re.DOTALL)
                    if not match:
                        return self.send_json(400, {"error": "开场图片仅支持 JPG、PNG 或 WebP"})
                    media_type = match.group(1)
                    raw = base64.b64decode(match.group(2), validate=True)
                    if len(raw) > 5 * 1024 * 1024:
                        return self.send_json(413, {"error": "开场图片不能超过 5MB"})
                    signatures_ok = {
                        "image/jpeg": raw.startswith(b"\xff\xd8\xff"),
                        "image/png": raw.startswith(b"\x89PNG\r\n\x1a\n"),
                        "image/webp": len(raw) >= 12 and raw[:4] == b"RIFF" and raw[8:12] == b"WEBP",
                    }
                    if not signatures_ok.get(media_type, False):
                        return self.send_json(400, {"error": "图片内容与文件类型不一致"})
                    extension = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp"}[media_type]
                    name = f"intro-{int(time.time())}-{secrets.token_hex(8)}.{extension}"
                    (UPLOAD_DIR / name).write_bytes(raw)
                    return self.send_json(201, {"url": f"/uploads/{name}"})
                if path == "/api/admin/music-upload":
                    encoded = str(data.get("data", ""))
                    match = re.fullmatch(r"data:audio/mpeg;base64,(.+)", encoded, re.DOTALL)
                    if not match:
                        return self.send_json(400, {"error": "背景音乐仅支持 MP3 文件"})
                    raw = base64.b64decode(match.group(1), validate=True)
                    if len(raw) > 12 * 1024 * 1024:
                        return self.send_json(413, {"error": "每首音乐不能超过 12MB"})
                    is_mp3 = raw.startswith(b"ID3") or (len(raw) >= 2 and raw[0] == 0xFF and raw[1] & 0xE0 == 0xE0)
                    if not is_mp3:
                        return self.send_json(400, {"error": "文件内容不是有效的 MP3"})
                    name = f"music-{int(time.time())}-{secrets.token_hex(8)}.mp3"
                    (UPLOAD_DIR / name).write_bytes(raw)
                    return self.send_json(201, {"url": f"/uploads/{name}"})
                with db() as connection:
                    if path == "/api/admin/media":
                        url = str(data.get("url", "")).strip()[:500]
                        thumbnail_url = str(data.get("thumbnail_url", "")).strip()[:500]
                        if not thumbnail_url:
                            thumbnail_url = media_thumbnails.generate(url, UPLOAD_DIR)
                        video_url = str(data.get("video_url", "")).strip()[:500]
                        title = str(data.get("title", "未命名照片")).strip()[:100]
                        meta = str(data.get("meta", "")).strip()[:100]
                        body = str(data.get("body", "")).strip()[:3000]
                        taken_at = str(data.get("taken_at", "")).strip()[:32]
                        show_on_home = 0 if str(data.get("show_on_home", "1")).lower() in {"0", "false", "off"} else 1
                        show_in_3d = 0 if str(data.get("show_in_3d", "1")).lower() in {"0", "false", "off"} else 1
                        show_in_stories = 0 if str(data.get("show_in_stories", "0")).lower() in {"0", "false", "off"} else 1
                        if not url:
                            return self.send_json(400, {"error": "请先上传图片"})
                        raw_order = data.get("sort_order")
                        requested_order = None
                        if raw_order not in (None, ""):
                            try:
                                requested_order = max(1, int(raw_order))
                            except (TypeError, ValueError):
                                return self.send_json(400, {"error": "展示顺序必须是整数"})
                        next_order = connection.execute(
                            "SELECT COALESCE(MAX(sort_order),0)+1 AS value FROM media"
                        ).fetchone()["value"]
                        cursor = connection.execute(
                            "INSERT INTO media(url,thumbnail_url,video_url,title,meta,body,taken_at,sort_order,sort_manual,show_on_home,show_in_3d,show_in_stories,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)",
                            (url, thumbnail_url, video_url, title, meta, body, taken_at, next_order, 1 if requested_order is not None else 0, show_on_home, show_in_3d, show_in_stories, now_iso()),
                        )
                        reposition_media(connection, cursor.lastrowid, requested_order)
                        connection.commit()
                        return self.send_json(201, {"id": cursor.lastrowid})
                    if path == "/api/admin/settings":
                        allowed = {
                            "site_title", "footer_title", "footer_subtitle", "browser_title", "site_icon_url", "nav_logo_url",
                            "hero_title", "profile_text", "hero_primary_button", "hero_secondary_button",
                            "hero_art_style", "hero_motion_level", "hero_show_captions",
                            "primary_color", "accent_color", "background_color", "color_mode",
                            "home_background_tone", "home_background_color", "home_accent_color", "home_background_overlay_opacity",
                            "home_background_url", "home_hero_image", "about_page_image", "home_card_story_image", "home_card_memory_image",
                            "home_card_timeline_image", "home_card_campus_image", "home_card_notes_image",
                            "home_card_about_image", "home_card_messages_image",
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
                        allowed.update(HOME_COPY_DEFAULTS)
                        allowed.update(HOME_VISUAL_DEFAULTS)
                        for key, value in data.items():
                            if key in allowed:
                                if key in {"display_font_scale", "display_media_scale"}:
                                    value = str(value) if str(value) in {"80", "90", "100", "110", "120"} else "100"
                                elif key == "hero_art_style":
                                    value = str(value) if str(value) in {"editorial", "dreamy", "cinematic"} else "editorial"
                                elif key == "hero_motion_level":
                                    value = str(value) if str(value) in {"quiet", "balanced", "vivid"} else "balanced"
                                elif key == "hero_show_captions":
                                    value = "0" if str(value).lower() in {"0", "false", "off"} else "1"
                                elif key == "home_background_tone":
                                    value = str(value) if str(value) in {"archive", "midnight", "lake", "sunset"} else "archive"
                                elif key == "home_card_tone":
                                    value = str(value) if str(value) in {"youth", "sky", "peach", "lavender"} else "youth"
                                elif key == "home_card_aspect_ratio":
                                    value = str(value) if str(value) in {"14:9", "3:2", "4:3"} else "14:9"
                                elif key == "home_card_aspects":
                                    value = sanitize_home_card_aspects(value)
                                elif key == "home_card_crops":
                                    value = sanitize_home_card_crops(value)
                                elif key == "home_card_visibility":
                                    value = sanitize_home_card_visibility(value)
                                elif key == "home_card_order":
                                    value = sanitize_home_card_order(value)
                                elif key == "music_default_volume":
                                    try:
                                        value = str(min(100, max(0, round(float(value)))))
                                    except (TypeError, ValueError):
                                        value = "35"
                                elif key == "music_playlist":
                                    value = sanitize_music_playlist(value)
                                elif key in {"home_background_color", "home_accent_color", "home_card_tone_color"}:
                                    value = str(value).lower() if re.fullmatch(r"#[0-9a-fA-F]{6}", str(value)) else HOME_VISUAL_DEFAULTS[key]
                                elif key == "home_background_blur":
                                    try:
                                        value = str(max(0, min(30, int(float(value)))))
                                    except (TypeError, ValueError):
                                        value = HOME_VISUAL_DEFAULTS[key]
                                elif key in HOME_VISUAL_OPACITY_KEYS:
                                    try:
                                        value = str(max(0, min(90, int(float(value)))))
                                    except (TypeError, ValueError):
                                        value = HOME_VISUAL_DEFAULTS[key]
                                elif key in HOME_VISUAL_ASSET_KEYS:
                                    value = sanitize_home_visual_asset(value)
                                elif key == "contact_douyin_url":
                                    value = str(value).strip()[:500] if re.fullmatch(r"https://[^\s\"'<>]+", str(value).strip(), re.IGNORECASE) else ""
                                elif key == "contact_custom_links":
                                    value = sanitize_custom_contact_links(value)
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
                                elif key == "galaxy_photo_border_color":
                                    value = str(value).lower() if re.fullmatch(r"#[0-9a-fA-F]{6}", str(value)) else "#242b30"
                                elif key.endswith("_extra_enabled"):
                                    value = "1" if str(value).lower() in {"1", "true", "on"} else "0"
                                elif key.endswith("_title_size"):
                                    value = str(value) if str(value) in {"small", "standard", "large"} else "standard"
                                elif key.endswith("_title_weight"):
                                    value = str(value) if str(value) in {"regular", "medium", "bold"} else "medium"
                                connection.execute(
                                    "INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
                                    (key, str(value)[:12000 if key == "timeline_items" else 8000 if key == "contact_custom_links" else 2000]),
                                )
                        connection.commit()
                        return self.send_json(200, {"ok": True})
                    if path == "/api/admin/homepage-intro":
                        intro_settings = data.get("settings")
                        intro_nodes = data.get("nodes")
                        if not isinstance(intro_settings, dict) or not isinstance(intro_nodes, list):
                            return self.send_json(400, {"error": "开场设置格式无效"})
                        clean_settings = {}
                        field_limits = {
                            "intro_logo": 500,
                            "intro_title": 80,
                            "intro_subtitle": 120,
                            "intro_background_image": 500,
                            "intro_background_desktop_image": 500,
                            "intro_background_mobile_image": 500,
                            "intro_watermark_1": 32,
                            "intro_watermark_2": 32,
                        }
                        for key, limit in field_limits.items():
                            clean_settings[key] = str(intro_settings.get(key, INTRO_SETTING_DEFAULTS[key])).strip()[:limit]
                        for asset_key in ("intro_logo", "intro_background_image", "intro_background_desktop_image", "intro_background_mobile_image"):
                            asset_url = clean_settings[asset_key]
                            if asset_url and not asset_url.startswith(("/assets/", "/uploads/")):
                                return self.send_json(400, {"error": "开场图片必须使用本站上传地址"})
                        clean_settings["intro_enabled"] = "0" if str(intro_settings.get("intro_enabled", "1")).lower() in {"0", "false", "off"} else "1"
                        clean_settings["intro_show_enter_button"] = "0" if str(intro_settings.get("intro_show_enter_button", "1")).lower() in {"0", "false", "off"} else "1"
                        try:
                            loading_duration = int(intro_settings.get("intro_loading_duration", 6000))
                        except (TypeError, ValueError):
                            return self.send_json(400, {"error": "Loading 时长必须是整数"})
                        clean_settings["intro_loading_duration"] = str(max(3000, min(10000, loading_duration)))
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
                                crop_value = float(intro_settings.get(key, INTRO_SETTING_DEFAULTS[key]))
                            except (TypeError, ValueError):
                                return self.send_json(400, {"error": "背景裁切参数无效"})
                            clean_settings[key] = f"{max(minimum, min(maximum, crop_value)):g}"
                        optional_crop_ranges = {
                            "intro_background_desktop_crop_left": (0, 100),
                            "intro_background_desktop_crop_top": (0, 100),
                            "intro_background_desktop_crop_width": (1, 100),
                            "intro_background_desktop_crop_height": (1, 100),
                            "intro_background_mobile_crop_left": (0, 100),
                            "intro_background_mobile_crop_top": (0, 100),
                            "intro_background_mobile_crop_width": (1, 100),
                            "intro_background_mobile_crop_height": (1, 100),
                        }
                        for key, (minimum, maximum) in optional_crop_ranges.items():
                            raw_value = str(intro_settings.get(key, "")).strip()
                            if not raw_value:
                                clean_settings[key] = ""
                                continue
                            try:
                                crop_value = float(raw_value)
                            except (TypeError, ValueError):
                                return self.send_json(400, {"error": "自由裁切参数无效"})
                            clean_settings[key] = f"{max(minimum, min(maximum, crop_value)):g}"
                        for key in ("intro_background_desktop_ratio_locked", "intro_background_mobile_ratio_locked"):
                            clean_settings[key] = "0" if str(intro_settings.get(key, "1")).lower() in {"0", "false", "off"} else "1"
                        for viewport in ("desktop", "mobile"):
                            left_key = f"intro_background_{viewport}_crop_left"
                            top_key = f"intro_background_{viewport}_crop_top"
                            width_key = f"intro_background_{viewport}_crop_width"
                            height_key = f"intro_background_{viewport}_crop_height"
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
                        for index, node in enumerate(intro_nodes[:12], start=1):
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
                        connection.execute("PRAGMA optimize")
                        connection.commit()
                        return self.send_json(200, {"ok": True})
        except (ValueError, TypeError, base64.binascii.Error) as exc:
            return self.send_json(400, {"error": str(exc) or "请求无效"})
        except Exception as exc:
            print(f"API error: {exc}")
            return self.send_json(500, {"error": "服务器暂时无法处理请求"})
        return self.send_json(404, {"error": "未找到接口"})

    def do_PATCH(self):
        path = self.route()
        if notes.dispatch(self, db, "PATCH", path):
            return
        if path.startswith("/api/v1/admin-app/"):
            return dispatch_admin_app_patch(self, path)
        if not self.require_admin():
            return self.send_json(401, {"error": "请重新登录"})
        match = re.fullmatch(r"/api/admin/media/(\d+)", path)
        if not match:
            return self.send_json(404, {"error": "未找到接口"})
        try:
            data = self.read_json()
            title = str(data.get("title", "未命名照片")).strip()[:100]
            meta = str(data.get("meta", "")).strip()[:100]
            body = str(data.get("body", "")).strip()[:3000]
            taken_at = str(data.get("taken_at", "")).strip()[:32]
            raw_order = data.get("sort_order")
            requested_order = None
            if raw_order not in (None, ""):
                requested_order = max(1, int(raw_order))
            show_on_home = 0 if str(data.get("show_on_home", "1")).lower() in {"0", "false", "off"} else 1
            show_in_3d = 0 if str(data.get("show_in_3d", "1")).lower() in {"0", "false", "off"} else 1
            with db() as connection:
                existing = connection.execute(
                    "SELECT url,thumbnail_url,video_url,show_in_stories FROM media WHERE id=?", (int(match.group(1)),)
                ).fetchone()
                if not existing:
                    return self.send_json(404, {"error": "图片不存在"})
                show_in_stories = 0 if str(data.get("show_in_stories", existing["show_in_stories"])).lower() in {"0", "false", "off"} else 1
                url = str(data.get("url", existing["url"])).strip()[:500]
                thumbnail_url = str(data.get("thumbnail_url", existing["thumbnail_url"])).strip()[:500]
                if url != existing["url"] and "thumbnail_url" not in data:
                    thumbnail_url = ""
                if not thumbnail_url:
                    thumbnail_url = media_thumbnails.generate(url, UPLOAD_DIR)
                video_url = str(data.get("video_url", existing["video_url"])).strip()[:500]
                if not url and not video_url:
                    return self.send_json(400, {"error": "每条内容至少要保留一张图片或一个视频"})
                cursor = connection.execute(
                    "UPDATE media SET url=?,thumbnail_url=?,video_url=?,title=?,meta=?,body=?,taken_at=?,sort_manual=?,show_on_home=?,show_in_3d=?,show_in_stories=? WHERE id=?",
                    (url, thumbnail_url, video_url, title, meta, body, taken_at, 1 if requested_order is not None else 0, show_on_home, show_in_3d, show_in_stories, int(match.group(1))),
                )
                reposition_media(connection, int(match.group(1)), requested_order)
                connection.commit()
            return self.send_json(200, {"ok": True})
        except (ValueError, TypeError) as exc:
            return self.send_json(400, {"error": str(exc) or "图片信息无效"})

    def do_DELETE(self):
        path = self.route()
        if notes.dispatch(self, db, "DELETE", path):
            return
        if path.startswith("/api/v1/admin-app/"):
            return dispatch_admin_app_delete(self, path)
        if not self.require_admin():
            return self.send_json(401, {"error": "请重新登录"})
        match = re.fullmatch(r"/api/admin/(comments|submissions|media)/(\d+)", path)
        if not match:
            return self.send_json(404, {"error": "未找到接口"})
        table = match.group(1)
        with db() as connection:
            connection.execute(f"DELETE FROM {table} WHERE id=?", (int(match.group(2)),))
            if table == "media":
                rows = connection.execute("SELECT id FROM media ORDER BY sort_order ASC, id ASC").fetchall()
                for index, row in enumerate(rows, start=1):
                    connection.execute("UPDATE media SET sort_order=? WHERE id=?", (index, row["id"]))
        return self.send_json(200, {"ok": True})


if __name__ == "__main__":
    initialize()
    host = os.environ.get("SITE_HOST", "127.0.0.1")
    port = int(os.environ.get("SITE_PORT", "8765"))
    print(f"Memory Archive API listening on {host}:{port}")
    ThreadingHTTPServer((host, port), Handler).serve_forever()
