import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
from thinkgear import ThinkGearParser


def frame(payload):
    return b'\xaa\xaa' + bytes([len(payload)]) + payload + bytes([(~sum(payload)) & 255])


class ThinkGearTests(unittest.TestCase):
    def test_real_device_frame_at_every_chunk_boundary(self):
        payload = bytes.fromhex('02 c8 83 18 00 00 10 00 00 1e 00 00 1b 00 00 14 00 00 2b 00 00 39 00 00 2b 00 00 14 04 00 05 00')
        packet = frame(payload)
        for split in range(len(packet) + 1):
            p = ThinkGearParser()
            result = p.feed(packet[:split]) + p.feed(packet[split:])
            self.assertEqual(len(result), 1)
            self.assertTrue(result[0]['checksumValid'])
            self.assertEqual(result[0]['values']['poorSignal'], 200)
            self.assertEqual(result[0]['values']['eegPower']['midGamma'], 20)

    def test_recovers_from_noise_bad_checksum_and_repeated_sync(self):
        bad = frame(b'\x02\xc8')[:-1] + b'\x00'
        good = frame(b'\x02\x00')
        results = ThinkGearParser().feed(b'noise\xaa' + bad + good)
        self.assertEqual([p['checksumValid'] for p in results], [False, True])
        self.assertNotIn('values', results[0])
        self.assertEqual(results[1]['values']['poorSignal'], 0)

    def test_signed_raw_samples_extremes_and_multiple_fields(self):
        payload = bytes.fromhex('80 02 80 00 80 02 ff ff 80 02 00 00 80 02 7f ff 06 ff')
        packet = ThinkGearParser().feed(frame(payload))[0]
        self.assertEqual(packet['raw16'], [-32768, -1, 0, 32767])
        self.assertEqual(packet['raw8'], [255])

    def test_unknown_extended_fields_do_not_override_standard_fields(self):
        packet = ThinkGearParser().feed(frame(bytes.fromhex('55 02 c8 99 03 01 02 03 02 00')))[0]
        self.assertEqual(packet['values'], {'poorSignal': 0})
        self.assertEqual(len(packet['fields']), 3)

    def test_malformed_payload_is_not_used(self):
        for payload in [b'\x55', b'\x83', b'\x83\x18\x01', b'\x80\x01\x00', b'\x02']:
            result = ThinkGearParser().feed(frame(payload))[0]
            self.assertTrue(result['checksumValid'])
            self.assertIn('decodeError', result)
            self.assertNotIn('values', result)

    def test_partial_header_noise_and_invalid_lengths_are_bounded(self):
        p = ThinkGearParser()
        self.assertEqual(p.feed(b'noise\xaa'), [])
        self.assertEqual(len(p.buffer), 1)
        p.feed(b'\xaa\xff' + b'noise' * 10000)
        self.assertLess(len(p.buffer), 3)
        self.assertEqual(len(p.feed(frame(b'\x02\x00'))), 1)


if __name__ == '__main__':
    unittest.main()
