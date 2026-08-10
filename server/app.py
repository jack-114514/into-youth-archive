#!/usr/bin/env python3
import base64
import hashlib
import hmac
import json
import os
import re
import secrets
import smtplib
import sqlite3
import time
from datetime import datetime, timezone
from email.message import EmailMessage
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlencode, urlparse
from urllib.request import Request, urlopen

DATA_DIR = Path(os.environ.get("SITE_DATA_DIR", "/opt/into-youth/data"))
UPLOAD_DIR = Path(os.environ.get("SITE_UPLOAD_DIR", "/opt/into-youth/uploads"))
DB_PATH = DATA_DIR / "site.db"
MAX_BODY = 18 * 1024 * 1024
PASSWORD_ITERATIONS = 600_000
LEGACY_PASSWORD_ITERATIONS = 240_000


def now_iso():
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def db():
    connection = sqlite3.connect(DB_PATH, timeout=10)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    connection.execute("PRAGMA journal_mode = WAL")
    return connection


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
    message["Subject"] = "INTO 青春纪事：管理员密码修改验证码"
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
    payload = urlencode({"secret": secret, "response": token, "remoteip": remote_ip}).encode()
    request = Request(
        "https://challenges.cloudflare.com/turnstile/v0/siteverify",
        data=payload,
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        method="POST",
    )
    with urlopen(request, timeout=12) as response:
        result = json.loads(response.read().decode("utf-8"))
    allowed_hostnames = {"intovalabs.com", "www.intovalabs.com"}
    return (
        bool(result.get("success"))
        and result.get("action") == "admin_password_recovery"
        and result.get("hostname") in allowed_hostnames
    )


def initialize():
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    with db() as connection:
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
              title TEXT NOT NULL,
              body TEXT NOT NULL,
              image TEXT,
              status TEXT NOT NULL DEFAULT 'pending',
              created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS media (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              url TEXT NOT NULL,
              video_url TEXT NOT NULL DEFAULT '',
              title TEXT NOT NULL,
              meta TEXT NOT NULL DEFAULT '',
              body TEXT NOT NULL DEFAULT '',
              taken_at TEXT NOT NULL DEFAULT '',
              sort_order INTEGER NOT NULL DEFAULT 0,
              sort_manual INTEGER NOT NULL DEFAULT 0,
              show_on_home INTEGER NOT NULL DEFAULT 1,
              show_in_3d INTEGER NOT NULL DEFAULT 1,
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
            CREATE INDEX IF NOT EXISTS idx_comments_status_created ON comments(status, created_at DESC);
            CREATE INDEX IF NOT EXISTS idx_submissions_status_created ON submissions(status, created_at DESC);
            """
        )
        admin_columns = {row["name"] for row in connection.execute("PRAGMA table_info(admins)")}
        if "username" not in admin_columns:
            connection.execute("ALTER TABLE admins ADD COLUMN username TEXT NOT NULL DEFAULT ''")
        media_columns = {row["name"] for row in connection.execute("PRAGMA table_info(media)")}
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
            "site_title": "INTO / 青春纪事",
            "hero_title": "把青春留在风经过的地方",
            "profile_text": "一个正在校园里认真生活的普通人。喜欢傍晚六点的风、窗边的位置，还有把一闪而过的瞬间变成很久很久的记忆。",
            "timeline_items": '[{"date":"2023.09","title":"第一次走进这里","text":"风很轻，书包很重，未来还是一张没有写字的纸。"},{"date":"2024.03","title":"春天在操场集合","text":"我们用一整个下午，把笑声留在跑道边。"},{"date":"2025.06","title":"教室最后一排","text":"黑板上的倒计时越来越小，想说的话却越来越多。"},{"date":"NOW","title":"故事仍在继续","text":"今天也值得记录。等未来回头看，它一定很亮。"}]',
        }
        for key, value in defaults.items():
            connection.execute("INSERT OR IGNORE INTO settings(key, value) VALUES(?, ?)", (key, value))
        connection.execute("PRAGMA optimize")


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

    def send_json(self, status, payload):
        encoded = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(encoded)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
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
        if path == "/api/health":
            return self.send_json(200, {"ok": True, "time": now_iso()})
        if path == "/api/content":
            with db() as connection:
                settings = {row["key"]: row["value"] for row in connection.execute("SELECT key,value FROM settings")}
                media = [dict(row) for row in connection.execute(
                    "SELECT id,url,video_url,title,meta,body,taken_at,sort_order,sort_manual,show_on_home,show_in_3d,created_at FROM media ORDER BY sort_order ASC, id ASC"
                )]
            return self.send_json(200, {"settings": settings, "media": media})
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
                if path == "/api/admin/comments":
                    rows = connection.execute("SELECT * FROM comments ORDER BY id DESC LIMIT 500").fetchall()
                    return self.send_json(200, {"comments": [dict(row) for row in rows]})
                if path == "/api/admin/submissions":
                    rows = connection.execute("SELECT * FROM submissions ORDER BY id DESC LIMIT 500").fetchall()
                    return self.send_json(200, {"submissions": [dict(row) for row in rows]})
                if path == "/api/admin/media":
                    rows = connection.execute("SELECT * FROM media ORDER BY sort_order ASC, id ASC").fetchall()
                    return self.send_json(200, {"media": [dict(row) for row in rows]})
        return self.send_json(404, {"error": "未找到接口"})

    def do_POST(self):
        path = self.route()
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
                title = str(data.get("title", "")).strip()[:100]
                body = str(data.get("body", "")).strip()[:3000]
                image = str(data.get("image", "")).strip()[:500] or None
                if not title or not body:
                    return self.send_json(400, {"error": "标题和故事内容不能为空"})
                with db() as connection:
                    connection.execute(
                        "INSERT INTO submissions(nickname,title,body,image,created_at) VALUES(?,?,?,?,?)",
                        (nickname, title, body, image, now_iso()),
                    )
                return self.send_json(201, {"ok": True})
            if path.startswith("/api/admin/"):
                if not self.require_admin():
                    return self.send_json(401, {"error": "请重新登录"})
                with db() as connection:
                    if path == "/api/admin/media":
                        url = str(data.get("url", "")).strip()[:500]
                        video_url = str(data.get("video_url", "")).strip()[:500]
                        title = str(data.get("title", "未命名照片")).strip()[:100]
                        meta = str(data.get("meta", "")).strip()[:100]
                        body = str(data.get("body", "")).strip()[:3000]
                        taken_at = str(data.get("taken_at", "")).strip()[:32]
                        show_on_home = 0 if str(data.get("show_on_home", "1")).lower() in {"0", "false", "off"} else 1
                        show_in_3d = 0 if str(data.get("show_in_3d", "1")).lower() in {"0", "false", "off"} else 1
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
                            "INSERT INTO media(url,video_url,title,meta,body,taken_at,sort_order,sort_manual,show_on_home,show_in_3d,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
                            (url, video_url, title, meta, body, taken_at, next_order, 1 if requested_order is not None else 0, show_on_home, show_in_3d, now_iso()),
                        )
                        reposition_media(connection, cursor.lastrowid, requested_order)
                        return self.send_json(201, {"id": cursor.lastrowid})
                    if path == "/api/admin/settings":
                        allowed = {"site_title", "hero_title", "profile_text", "timeline_items"}
                        for key, value in data.items():
                            if key in allowed:
                                connection.execute(
                                    "INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
                                    (key, str(value)[:12000 if key == "timeline_items" else 2000]),
                                )
                        return self.send_json(200, {"ok": True})
        except (ValueError, TypeError, base64.binascii.Error) as exc:
            return self.send_json(400, {"error": str(exc) or "请求无效"})
        except Exception as exc:
            print(f"API error: {exc}")
            return self.send_json(500, {"error": "服务器暂时无法处理请求"})
        return self.send_json(404, {"error": "未找到接口"})

    def do_PATCH(self):
        path = self.route()
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
                    "SELECT url,video_url FROM media WHERE id=?", (int(match.group(1)),)
                ).fetchone()
                if not existing:
                    return self.send_json(404, {"error": "图片不存在"})
                url = str(data.get("url", existing["url"])).strip()[:500]
                video_url = str(data.get("video_url", existing["video_url"])).strip()[:500]
                if not url and not video_url:
                    return self.send_json(400, {"error": "每条内容至少要保留一张图片或一个视频"})
                cursor = connection.execute(
                    "UPDATE media SET url=?,video_url=?,title=?,meta=?,body=?,taken_at=?,sort_manual=?,show_on_home=?,show_in_3d=? WHERE id=?",
                    (url, video_url, title, meta, body, taken_at, 1 if requested_order is not None else 0, show_on_home, show_in_3d, int(match.group(1))),
                )
                reposition_media(connection, int(match.group(1)), requested_order)
            return self.send_json(200, {"ok": True})
        except (ValueError, TypeError) as exc:
            return self.send_json(400, {"error": str(exc) or "图片信息无效"})

    def do_DELETE(self):
        path = self.route()
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
    print(f"INTO Youth API listening on {host}:{port}")
    ThreadingHTTPServer((host, port), Handler).serve_forever()
