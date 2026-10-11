"""Generate the illustrative group QR: python3 scripts/generate-demo-group-qr.py.

Requires Python's qrcode package only; writes a PNG using the standard library.
The payload is plain text, so scanning works without a running local server and
cannot be mistaken for a working WeChat invitation or an unpublished URL.
"""
from pathlib import Path
import struct
import zlib

import qrcode


PAYLOAD = '在野 · 森林同行群（演示）\n此二维码仅供演示，不是微信群邀请。'
SCALE = 12
qr = qrcode.QRCode(error_correction=qrcode.constants.ERROR_CORRECT_M, border=4)
qr.add_data(PAYLOAD)
qr.make(fit=True)
matrix = qr.get_matrix()
size = len(matrix) * SCALE


def chunk(kind, data):
    return (struct.pack('!I', len(data)) + kind + data
            + struct.pack('!I', zlib.crc32(kind + data) & 0xffffffff))


# Eight-bit grayscale, one filter byte per scanline; retain four white modules
# on every edge. No logo or styling is drawn over encoded modules.
rows = b''.join((b'\0' + b''.join(bytes([0 if cell else 255]) * SCALE
                               for cell in row)) * SCALE for row in matrix)
png = (b'\x89PNG\r\n\x1a\n'
       + chunk(b'IHDR', struct.pack('!IIBBBBB', size, size, 8, 0, 0, 0, 0))
       + chunk(b'IDAT', zlib.compress(rows, 9)) + chunk(b'IEND', b''))
target = Path(__file__).resolve().parents[1] / 'public/shop/forest-group-demo.png'
target.parent.mkdir(parents=True, exist_ok=True)
target.write_bytes(png)
print(f'Group demo QR → {target} ({size} × {size}px)')
