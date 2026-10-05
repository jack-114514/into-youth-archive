import subprocess
import sys
from pathlib import Path
import unittest

class NativeParityTests(unittest.TestCase):
    def test_native_management_round_trip(self):
        result=subprocess.run([sys.executable,str(Path(__file__).with_name('admin_parity_check.py'))],capture_output=True,text=True,encoding='utf-8',errors='replace',timeout=90)
        self.assertEqual(result.returncode,0,result.stdout+'\n'+result.stderr)
        self.assertIn('"passed": 26',result.stdout)
