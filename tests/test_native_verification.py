"""Run the authentication HTTP fixtures in a separate process."""
from pathlib import Path
import subprocess
import sys
import unittest

class NativeVerificationTests(unittest.TestCase):
    def test_native_verification_contract(self):
        root = Path(__file__).resolve().parent.parent
        result = subprocess.run([sys.executable, str(root / 'tests/native_verification_check.py')],
                                cwd=root, capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

if __name__ == '__main__':
    unittest.main()
