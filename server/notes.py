"""Short journal entries, isolated from photo and visitor-message storage."""
import re
from datetime import date, datetime, timedelta, timezone


def initialize(connection):
    connection.executescript("""
        CREATE TABLE IF NOT EXISTS notes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            body TEXT NOT NULL,
            recorded_on TEXT NOT NULL,
            status TEXT NOT NULL CHECK(status IN ('draft','published','archived')),
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_notes_public_date
            ON notes(status, recorded_on DESC, id DESC);
    """)


def validate(data):
    if not isinstance(data, dict):
        raise ValueError("随手记格式无效")
    title = str(data.get("title", "")).strip()
    body = str(data.get("body", "")).strip()
    recorded_on = str(data.get("recorded_on", "")).strip()
    status = data.get("status", "draft")
    if not title or len(title) > 100:
        raise ValueError("请填写标题，最多 100 字")
    if not body or len(body) > 12000:
        raise ValueError("请填写正文，最多 12000 字")
    if not recorded_on:
        recorded_on = datetime.now(timezone(timedelta(hours=8))).date().isoformat()
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", recorded_on):
        raise ValueError("请选择有效的记录日期")
    date.fromisoformat(recorded_on)
    if status not in ("draft", "published", "archived"):
        raise ValueError("发布状态无效")
    return title, body, recorded_on, status


def dispatch(handler, db, method, path, authorized=False):
    public = path == "/api/notes"
    item = re.fullmatch(r"/api/admin/notes/(\d+)", path)
    admin = path == "/api/admin/notes" or item is not None
    if not public and not admin:
        return False
    if public and method != "GET":
        handler.send_json(405, {"error": "访客只能阅读已发布的随手记"})
        return True
    if admin and not authorized and not handler.require_admin():
        handler.send_json(401, {"error": "请重新登录"})
        return True
    try:
        with db() as connection:
            if method == "GET" and not item:
                query = "SELECT * FROM notes"
                if public:
                    query += " WHERE status='published'"
                rows = connection.execute(query + " ORDER BY recorded_on DESC,id DESC").fetchall()
                handler.send_json(200, {"notes": [dict(row) for row in rows]})
            elif method == "POST" and admin and not item:
                fields = validate(handler.read_json())
                now = datetime.now(timezone.utc).isoformat()
                cursor = connection.execute(
                    "INSERT INTO notes(title,body,recorded_on,status,created_at,updated_at) VALUES(?,?,?,?,?,?)",
                    (*fields, now, now),
                )
                connection.commit()
                handler.send_json(201, {"id": cursor.lastrowid})
            elif item and method in ("PATCH", "DELETE"):
                note_id = int(item.group(1))
                if not connection.execute("SELECT 1 FROM notes WHERE id=?", (note_id,)).fetchone():
                    handler.send_json(404, {"error": "随手记不存在"})
                    return True
                now = datetime.now(timezone.utc).isoformat()
                if method == "DELETE":
                    connection.execute("UPDATE notes SET status='archived',updated_at=? WHERE id=?", (now, note_id))
                else:
                    fields = validate(handler.read_json())
                    connection.execute(
                        "UPDATE notes SET title=?,body=?,recorded_on=?,status=?,updated_at=? WHERE id=?",
                        (*fields, now, note_id),
                    )
                connection.commit()
                handler.send_json(200, {"ok": True})
            else:
                handler.send_json(405, {"error": "不支持此操作"})
    except (ValueError, TypeError):
        handler.send_json(400, {"error": "请检查标题、正文、日期和发布状态"})
    return True
