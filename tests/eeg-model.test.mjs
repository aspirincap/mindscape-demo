import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCapture, appendEvents, clearCapture, rawBytes, MAX_EVENTS } from '../src/eeg/model.mjs';

const chunk = (id, hex = 'AA 00 FF') => ({ id, timestamp: id * 1000, hex, length: hex.split(' ').length, packets: [] });

test('binary export preserves raw bytes across arbitrary chunks, noise and bad packets', () => {
  assert.deepEqual([...rawBytes([chunk(1, '00 AA'), chunk(2, 'AA FF 0D 0A 80')])], [0, 170, 170, 255, 13, 10, 128]);
});
test('SSE replay neither duplicates captured data nor resurrects cleared data', () => {
  let c = createCapture();
  appendEvents(c, [chunk(1), chunk(2)]);
  appendEvents(c, [chunk(1), chunk(2), chunk(3)]);
  assert.equal(c.events.length, 3);
  c = clearCapture(c);
  appendEvents(c, [chunk(1), chunk(3), chunk(4)]);
  assert.deepEqual(c.events.map(e => e.id), [4]);
});
test('capture is bounded and reports evicted chunks', () => {
  const c = createCapture();
  appendEvents(c, Array.from({ length: MAX_EVENTS + 12 }, (_, i) => chunk(i + 1)));
  assert.equal(c.events.length, MAX_EVENTS);
  assert.equal(c.evicted, 12);
  assert.equal(c.events[0].id, 13);
});
test('only real, valid raw fields populate waveform buffers; modes stay separate', () => {
  const c = createCapture();
  const e = chunk(1);
  e.packets = [
    { checksumValid: false, raw16: [123] },
    { checksumValid: true, decodeError: 'invalid', raw16: [456] },
    { checksumValid: true, raw16: [-1, -32768], raw8: [255] },
  ];
  appendEvents(c, [e]);
  assert.deepEqual(c.raw16.map(p => p.value), [-1, -32768]);
  assert.deepEqual(c.raw8.map(p => p.value), [255]);
});
