"""Incremental ThinkGear parser. Serial chunks are preserved separately, verbatim."""

BANDS = ('delta', 'theta', 'lowAlpha', 'highAlpha', 'lowBeta', 'highBeta', 'lowGamma', 'midGamma')


def decode_payload(payload):
    fields, values, raw16, raw8 = [], {}, [], []
    i = 0
    while i < len(payload):
        level = 0
        while i < len(payload) and payload[i] == 0x55:
            level += 1
            i += 1
        if i >= len(payload):
            raise ValueError('EXCODE 后缺少字段代码')
        code = payload[i]
        i += 1
        size = 1
        if code >= 0x80:
            if i >= len(payload):
                raise ValueError('字段缺少长度')
            size = payload[i]
            i += 1
        if i + size > len(payload):
            raise ValueError('字段长度超出数据包')
        data = payload[i:i + size]
        i += size
        field = {'code': f'0x{code:02X}', 'level': level, 'hex': data.hex(' ').upper(), 'length': size}
        if level == 0:
            expected = {0x80: 2, 0x83: 24}
            if code in expected and size != expected[code]:
                raise ValueError(f'0x{code:02X} 字段长度错误')
            name = {2: 'poorSignal', 4: 'attention', 5: 'meditation'}.get(code)
            if name:
                values[name] = data[0]
                field.update(name=name, value=data[0])
            elif code == 0x80:
                value = int.from_bytes(data, 'big', signed=True)
                raw16.append(value)
                field.update(name='raw16', value=value)
            elif code == 6:
                raw8.append(data[0])
                field.update(name='raw8', value=data[0])
            elif code == 0x83:
                values['eegPower'] = dict(zip(BANDS, (int.from_bytes(data[j:j+3], 'big') for j in range(0, 24, 3))))
                field.update(name='eegPower', value=values['eegPower'])
        fields.append(field)
    return {'fields': fields, 'values': values, 'raw16': raw16, 'raw8': raw8}


class ThinkGearParser:
    def __init__(self):
        self.buffer = bytearray()
        self.discarded = 0

    def feed(self, chunk):
        self.buffer.extend(chunk)
        packets = []
        while len(self.buffer) >= 3:
            start = self.buffer.find(b'\xaa\xaa')
            if start < 0:
                keep = 1 if self.buffer[-1] == 0xAA else 0
                self.discarded += len(self.buffer) - keep
                self.buffer[:] = self.buffer[-1:] if keep else b''
                break
            if start:
                self.discarded += start
                del self.buffer[:start]
            if len(self.buffer) < 3:
                break
            length = self.buffer[2]
            if length > 169:
                self.discarded += 1
                del self.buffer[0]
                continue
            if len(self.buffer) < length + 4:
                break
            frame = bytes(self.buffer[:length + 4])
            payload = frame[3:-1]
            expected = (~sum(payload)) & 255
            valid = expected == frame[-1]
            packet = {'hex': frame.hex(' ').upper(), 'length': len(frame), 'payloadLength': length,
                      'checksumValid': valid, 'checksumExpected': expected, 'checksumReceived': frame[-1]}
            if valid:
                del self.buffer[:length + 4]
                try:
                    packet.update(decode_payload(payload))
                except ValueError as error:
                    packet['decodeError'] = str(error)
            else:
                # Scan again to recover a valid frame following a corrupted length/header.
                del self.buffer[0]
                self.discarded += 1
            packets.append(packet)
        return packets
