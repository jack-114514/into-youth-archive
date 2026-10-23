import unittest
from unittest.mock import patch
from server import app


class CpuSamplingTests(unittest.TestCase):
    def setUp(self):
        app._cpu_sample = None

    def test_cpu_delta_excludes_guest_time_and_counts_iowait_idle(self):
        with patch.object(app.Path, 'read_text', side_effect=[
            'cpu 100 0 100 700 100 0 0 0 99 0\n',
            'cpu 120 0 110 750 120 0 0 0 109 0\n',
        ]), patch.object(app.os, 'getloadavg', return_value=(1.2, .9, .5), create=True):
            self.assertIsNone(app.read_server_cpu()['used_percent'])
            result = app.read_server_cpu()
        self.assertEqual(result['used_percent'], 30)
        self.assertEqual(result['load_5m'], .9)

    def test_missing_proc_does_not_break_status(self):
        with patch.object(app.Path, 'read_text', side_effect=OSError):
            self.assertIsNone(app.read_server_cpu()['used_percent'])

    def test_zero_delta_reuses_last_sample_and_counter_reset_is_safe(self):
        app._cpu_sample = (1000, 800, 20)
        with patch.object(app.Path, 'read_text', return_value='cpu 100 0 100 700 100 0 0 0\n'):
            self.assertEqual(app.read_server_cpu()['used_percent'], 20)
