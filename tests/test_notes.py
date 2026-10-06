import gc
import hashlib
import json
import os
import tempfile
import threading
import time
import unittest
from http.server import ThreadingHTTPServer
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, urlopen
from unittest.mock import patch
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from server import app, admin_app_api, media_thumbnails
from PIL import Image


class JournalTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory()
        app.DATA_DIR = Path(cls.tmp.name)
        app.UPLOAD_DIR = app.DATA_DIR / "uploads"
        app.DB_PATH = app.DATA_DIR / "site.db"
        admin_app_api.DB_PATH = app.DB_PATH
        admin_app_api.DATA_DIR = app.DATA_DIR
        admin_app_api.UPLOAD_DIR = app.UPLOAD_DIR
        cls.env = patch.dict(os.environ, {"ADMIN_USERNAME": "journal@example.test", "ADMIN_PASSWORD": "isolated-journal-test-password"})
        cls.env.start()
        app.initialize()
        cls.token = "isolated-journal-session"
        with app.db() as connection:
            connection.execute("INSERT INTO sessions VALUES(?,?)", (hashlib.sha256(cls.token.encode()).hexdigest(), int(time.time()) + 600))
            cls.native_token = admin_app_api._new_session(connection)["access_token"]
        class QuietHandler(app.Handler):
            def log_message(self, *args):
                pass
        cls.http = ThreadingHTTPServer(("127.0.0.1", 0), QuietHandler)
        cls.thread = threading.Thread(target=cls.http.serve_forever, daemon=True)
        cls.thread.start()
        cls.base = f"http://127.0.0.1:{cls.http.server_port}"

    @classmethod
    def tearDownClass(cls):
        cls.http.shutdown()
        cls.http.server_close()
        cls.thread.join()
        cls.env.stop()
        gc.collect()
        cls.tmp.cleanup()

    def setUp(self):
        with app.db() as connection:
            connection.execute("DELETE FROM notes")

    def request(self, path, method="GET", data=None, admin=False):
        headers = {"Content-Type": "application/json"}
        if admin:
            headers["Authorization"] = "Bearer " + (self.native_token if admin == "native" else self.token)
        request = Request(self.base + path, method=method, headers=headers, data=json.dumps(data).encode() if data is not None else None)
        try:
            response = urlopen(request, timeout=5)
        except HTTPError as error:
            response = error
        with response:
            return response.status, json.load(response)

    def create(self, **overrides):
        fields = {"title": "窗边的风", "body": "今天的校园小事。\n第二段原样保留。", "recorded_on": "2026-10-06", "status": "draft", **overrides}
        code, data = self.request("/api/admin/notes", "POST", fields, True)
        self.assertEqual(code, 201)
        return data["id"], fields

    def test_draft_is_private_and_publish_edit_persists(self):
        note_id, fields = self.create()
        self.assertEqual(self.request("/api/notes")[1]["notes"], [])
        fields.update(status="published", body="编辑后的正文\n<script>不是可执行代码</script>")
        self.assertEqual(self.request(f"/api/admin/notes/{note_id}", "PATCH", fields, True)[0], 200)
        public = self.request("/api/notes")[1]["notes"]
        self.assertEqual(len(public), 1)
        self.assertEqual(public[0]["body"], fields["body"])
        self.assertEqual(self.request("/api/admin/notes", admin=True)[1]["notes"][0]["id"], note_id)

    def test_authorization_covers_all_admin_methods(self):
        for path, method in [("/api/admin/notes", "GET"), ("/api/admin/notes", "POST"), ("/api/admin/notes/1", "PATCH"), ("/api/admin/notes/1", "DELETE")]:
            self.assertEqual(self.request(path, method, {} if method in ("POST", "PATCH") else None)[0], 401)
        self.assertEqual(self.request("/api/notes", "POST", {})[0], 405)

    def test_archive_hides_and_retains_record_then_restore(self):
        note_id, fields = self.create(status="published")
        self.assertEqual(self.request(f"/api/admin/notes/{note_id}", "DELETE", admin=True)[0], 200)
        self.assertEqual(self.request("/api/notes")[1]["notes"], [])
        archived = self.request("/api/admin/notes", admin=True)[1]["notes"][0]
        self.assertEqual(archived["status"], "archived")
        self.assertEqual(archived["body"], fields["body"])
        self.assertEqual(self.request(f"/api/admin/notes/{note_id}", "PATCH", fields, True)[0], 200)
        self.assertEqual(len(self.request("/api/notes")[1]["notes"]), 1)

    def test_date_order_and_validation_do_not_truncate_or_overwrite(self):
        first, fields = self.create(status="published", recorded_on="2026-10-01")
        second, _ = self.create(status="published", recorded_on="2026-10-06")
        self.assertEqual([n["id"] for n in self.request("/api/notes")[1]["notes"]], [second, first])
        for overrides in [{"recorded_on": "2026-02-30"}, {"body": " "}, {"body": "x" * 12001}, {"title": "x" * 101}, {"status": "public"}]:
            self.assertEqual(self.request(f"/api/admin/notes/{first}", "PATCH", {**fields, **overrides}, True)[0], 400)
        self.assertEqual(self.request("/api/admin/notes/9999999", "PATCH", fields, True)[0], 404)
        self.assertEqual(self.request("/api/notes")[1]["notes"][-1]["body"], fields["body"])

    def test_thumbnail_keeps_original_and_preserves_existing_custom_crop(self):
        source = app.UPLOAD_DIR / "landscape.jpg"
        Image.new("RGB", (2400, 1600), "green").save(source, "JPEG")
        digest = hashlib.sha256(source.read_bytes()).hexdigest()
        url = media_thumbnails.generate("/uploads/landscape.jpg", app.UPLOAD_DIR)
        self.assertTrue(url.startswith("/uploads/preview-"))
        preview = app.UPLOAD_DIR / url.rsplit("/", 1)[-1]
        with Image.open(preview) as image:
            self.assertEqual(image.size, (720, 480))
        self.assertEqual(hashlib.sha256(source.read_bytes()).hexdigest(), digest)
        self.assertEqual(media_thumbnails.generate("/uploads/landscape.jpg", app.UPLOAD_DIR), url)
        for bad in ["/uploads/../site.db", "https://remote.test/photo.jpg", "/uploads/missing.jpg", "/uploads/..\\site.db"]:
            self.assertEqual(media_thumbnails.generate(bad, app.UPLOAD_DIR), "")
        with app.db() as connection:
            cursor = connection.execute("INSERT INTO media(url,thumbnail_url,title,meta,created_at) VALUES(?,?,?,?,?)", ("/uploads/landscape.jpg", "/uploads/custom.webp", "original", "", app.now_iso()))
            media_thumbnails.backfill(connection, app.UPLOAD_DIR)
            self.assertEqual(connection.execute("SELECT thumbnail_url FROM media WHERE id=?", (cursor.lastrowid,)).fetchone()[0], "/uploads/custom.webp")

    def test_multiframe_phone_jpeg_can_use_a_static_first_frame_preview(self):
        source = app.UPLOAD_DIR / "phone.jpg"
        Image.new("RGB", (1600, 800), "purple").save(source, "JPEG")
        image = Image.open(source)
        image.format = "MPO"
        image.is_animated = True
        with patch("server.media_thumbnails.Image.open", return_value=image):
            preview = media_thumbnails.generate("/uploads/phone.jpg", app.UPLOAD_DIR)
        self.assertTrue(preview.startswith("/uploads/preview-"))

    def test_web_and_native_create_replace_and_preserve_custom_preview(self):
        Image.new("RGB", (1700, 1000), "blue").save(app.UPLOAD_DIR / "auto-first.jpg", "JPEG")
        Image.new("RGB", (1800, 1100), "orange").save(app.UPLOAD_DIR / "auto-next.jpg", "JPEG")
        for base, admin in [("/api/admin/media", True), ("/api/v1/admin-app/media", "native")]:
            code, result = self.request(base, "POST", {"url": "/uploads/auto-first.jpg", "title": "自动预览"}, admin)
            self.assertEqual(code, 201, result)
            media_id = result["id"]
            with app.db() as connection:
                first = connection.execute("SELECT thumbnail_url FROM media WHERE id=?", (media_id,)).fetchone()[0]
            self.assertTrue(first.startswith("/uploads/preview-"))
            self.assertEqual(self.request(base + f"/{media_id}", "PATCH", {"url": "/uploads/auto-next.jpg"}, admin)[0], 200)
            with app.db() as connection:
                second = connection.execute("SELECT thumbnail_url FROM media WHERE id=?", (media_id,)).fetchone()[0]
            self.assertNotEqual(first, second, base)
            custom = {"thumbnail_url": "/uploads/manual-custom.webp", "title": "手动取景"}
            self.assertEqual(self.request(base + f"/{media_id}", "PATCH", custom, admin)[0], 200)
            self.assertEqual(self.request(base + f"/{media_id}", "PATCH", {"title": "只改文字"}, admin)[0], 200)
            with app.db() as connection:
                self.assertEqual(connection.execute("SELECT thumbnail_url FROM media WHERE id=?", (media_id,)).fetchone()[0], custom["thumbnail_url"])

    def test_native_notes_share_web_journal_and_require_native_session(self):
        base = "/api/v1/admin-app/notes"
        fields = {"title": "手机随手记", "body": "安卓发布\n网页阅读", "recorded_on": "2026-10-06", "status": "draft"}
        for method, path in [("GET", base), ("POST", base), ("PATCH", base + "/1"), ("DELETE", base + "/1")]:
            self.assertEqual(self.request(path, method, fields if method in ("POST", "PATCH") else None)[0], 401)
        self.assertEqual(self.request(base, admin=True)[0], 401)
        code, result = self.request(base, "POST", fields, "native")
        self.assertEqual(code, 201, result)
        note_id = result["id"]
        self.assertEqual(self.request("/api/notes")[1]["notes"], [])
        self.assertEqual(self.request(base, admin="native")[1]["notes"][0]["id"], note_id)
        fields["status"] = "published"
        self.assertEqual(self.request(base + f"/{note_id}", "PATCH", fields, "native")[0], 200)
        self.assertEqual(self.request("/api/notes")[1]["notes"][0]["body"], fields["body"])
        self.assertEqual(self.request("/api/admin/notes", admin=True)[1]["notes"][0]["id"], note_id)
        self.assertEqual(self.request(base + f"/{note_id}", "DELETE", admin="native")[0], 200)
        self.assertEqual(self.request("/api/notes")[1]["notes"], [])
        self.assertEqual(self.request(base + f"/{note_id}", "PATCH", fields, "native")[0], 200)
        self.assertEqual(len(self.request("/api/notes")[1]["notes"]), 1)


if __name__ == "__main__":
    unittest.main()
