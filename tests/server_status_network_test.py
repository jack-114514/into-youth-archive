import unittest
from unittest.mock import patch
from server import app


class NetworkSamplingTests(unittest.TestCase):
    def setUp(self):
        app._network_sample = None

    def test_rx_is_download_tx_is_upload_and_virtual_interfaces_are_excluded(self):
        route = 'Iface Destination Gateway Flags RefCnt Use Metric Mask\neth0 00000000 0100007F 0003 0 0 100 00000000\ndocker0 00000000 0 0003 0 0 500 00000000\n'
        counters = iter([
            'h\nh\nlo: 900000 0 0 0 0 0 0 0 900000 0\neth0: 1000 0 0 0 0 0 0 0 2000 0\ndocker0: 900000 0 0 0 0 0 0 0 900000 0\n',
            'h\nh\neth0: 3000 0 0 0 0 0 0 0 2500 0\n',
        ])
        def read(path, *args, **kwargs):
            return route if path.name == 'route' else next(counters)
        with patch.object(app.Path, 'read_text', read), patch.object(app.time, 'monotonic', side_effect=[10, 10.5]):
            self.assertIsNone(app.read_server_network()['rx_bytes_per_second'])
            result = app.read_server_network()
        self.assertEqual(result['interface'], 'eth0')
        self.assertEqual(result['rx_bytes_per_second'], 4000)
        self.assertEqual(result['tx_bytes_per_second'], 1000)
        self.assertEqual(result['rx_bytes'], 3000)

    def test_counter_reset_and_interface_change_start_fresh_sample(self):
        for previous in [(10, 'eth0', 5000, 5000, 100, 200), (10, 'eth1', 1, 1, 100, 200)]:
            app._network_sample = previous
            with patch.object(app.Path, 'read_text', side_effect=['h\neth0 00000000 0 0003 0 0 100 00000000\n', 'h\nh\neth0: 1000 0 0 0 0 0 0 0 2000 0\n']), patch.object(app.time, 'monotonic', return_value=11):
                self.assertIsNone(app.read_server_network()['rx_bytes_per_second'])

    def test_rapid_concurrent_read_reuses_last_completed_interval(self):
        app._network_sample = (10, 'eth0', 1000, 2000, 100, 200)
        with patch.object(app.Path, 'read_text', side_effect=['h\neth0 00000000 0 0003 0 0 100 00000000\n', 'h\nh\neth0: 1001 0 0 0 0 0 0 0 2001 0\n']), patch.object(app.time, 'monotonic', return_value=10.1):
            self.assertEqual(app.read_server_network()['rx_bytes_per_second'], 100)

    def test_unavailable_proc_and_missing_route_are_safe(self):
        with patch.object(app.Path, 'read_text', side_effect=OSError):
            self.assertIsNone(app.read_server_network()['interface'])
        with patch.object(app.Path, 'read_text', return_value='header\n'):
            self.assertIsNone(app.read_server_network()['interface'])
