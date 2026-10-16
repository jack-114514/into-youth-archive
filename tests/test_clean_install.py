"""Fresh installs stay empty; restarts preserve owner data and emptied lists."""
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]


class CleanInstallTests(unittest.TestCase):
    def test_clean_database_ignores_legacy_demo_flag_and_preserves_owner_content(self):
        for legacy in (None, '0', '1'):
            with self.subTest(legacy=legacy), tempfile.TemporaryDirectory() as directory:
                environment = {**os.environ, 'SITE_DATA_DIR': directory,
                               'SITE_UPLOAD_DIR': str(Path(directory) / 'uploads'),
                               'ADMIN_USERNAME': 'clean@example.org',
                               'ADMIN_PASSWORD': 'isolated-clean-test-password'}
                environment.pop('SEED_DEMO_CONTENT', None)
                if legacy is not None:
                    environment['SEED_DEMO_CONTENT'] = legacy
                code = '''
from server import app
app.initialize()
with app.db() as db:
    for table in ('media', 'comments', 'submissions', 'notes'):
        assert db.execute(f'SELECT COUNT(*) FROM {table}').fetchone()[0] == 0, table
    assert db.execute("SELECT value FROM settings WHERE key='timeline_items'").fetchone()[0] == '[]'
    assert db.execute("SELECT value FROM site_stats WHERE key='page_views'").fetchone()[0] == 0
    db.execute("INSERT INTO media(url,thumbnail_url,title,meta,sort_order,created_at) VALUES('/uploads/own.png','/uploads/own.png','Own title','Own caption',1,'2026-01-01')")
    db.execute("UPDATE settings SET value=? WHERE key='timeline_items'", ('[{"date":"2026","title":"Own event","text":"Own text"}]',))
    before = dict(db.execute('SELECT * FROM media').fetchone())
    timeline = db.execute("SELECT value FROM settings WHERE key='timeline_items'").fetchone()[0]
app.initialize()
with app.db() as db:
    assert dict(db.execute('SELECT * FROM media').fetchone()) == before
    assert db.execute("SELECT value FROM settings WHERE key='timeline_items'").fetchone()[0] == timeline
    db.execute('DELETE FROM media')
    db.execute("UPDATE settings SET value='[]' WHERE key='timeline_items'")
app.initialize()
with app.db() as db:
    assert db.execute('SELECT COUNT(*) FROM media').fetchone()[0] == 0
    assert db.execute("SELECT value FROM settings WHERE key='timeline_items'").fetchone()[0] == '[]'
assert list(app.UPLOAD_DIR.iterdir()) == []
'''
                result = subprocess.run([sys.executable, '-c', code], cwd=ROOT, env=environment,
                                        text=True, capture_output=True, timeout=30)
                self.assertEqual(result.returncode, 0, result.stderr)


if __name__ == '__main__':
    unittest.main()
