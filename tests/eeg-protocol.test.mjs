import test from 'node:test';
import assert from 'node:assert/strict';
import { EEG_PROTOCOL, validateEEG, EEGSequence, EEGClock } from '../src/core/eeg-protocol.mjs';
import { EEGObservations } from '../server/eeg-observations.mjs';
import { pairingConfig } from '../server/eeg-forwarder.mjs';
import { EEGSession } from '../worker/eeg-session.mjs';
import { sample } from './eeg-fixture.mjs';
test('single protocol rejects old, missing and unknown versions, invalid metadata and NaN', () => {
  for (const protocol of [undefined, 'mindscape.v1', 'mindscape.eeg.v3']) assert.throws(() => validateEEG(sample(1, { protocol })), /协议/);
  for (const seq of [-1, NaN, 1.5]) assert.throws(() => validateEEG(sample(seq)));
  const bad = sample(); bad.frame.attention = NaN; assert.throws(() => validateEEG(bad));
});
test('validity derived from source values, contact and separate ages; HR optional', () => {
  let d = sample(); assert.equal(validateEEG(d).frame.HR, null); assert.equal(validateEEG(d).frame.valid.relaxation, true);
  d.frame.valid = { attention: true, relaxation: true }; d.frame.attention = 0;
  assert.equal(validateEEG(d).frame.attention, null); assert.equal(validateEEG(d).frame.valid.attention, false);
  d.frame.poorSignal = 20; assert.equal(validateEEG(d).frame.signalQuality, 0); assert.equal(validateEEG(d).frame.valid.relaxation, false);
  d.frame.poorSignal = 0; d.frame.ageMs.attention = 2500; assert.equal(validateEEG(d).frame.valid.attention, false); assert.equal(validateEEG(d).frame.valid.relaxation, true);
  d.frame.ageMs.poorSignal = 2500; assert.equal(validateEEG(d).frame.valid.relaxation, false);
});
test('sample IDs stop replay, rollback and old-field rejuvenation', () => {
  const s = new EEGSequence(); s.accept(sample(), 1000);
  assert.throws(() => s.accept(sample(), 2000));
  let d = sample(2); d.frame.sampleIds.relaxation = 1;
  assert.equal(s.accept(d, 3000).frame.ageMs.relaxation, 2000);
  d = sample(3); d.frame.sampleIds.relaxation = 1;
  assert.equal(s.accept(d, 3600).frame.valid.relaxation, false);
  d = sample(4); d.frame.sampleIds.relaxation = 1; d.frame.relaxation = .8; assert.throws(() => s.accept(d, 3700));
  s.accept(sample(1, { streamId: '00000000-0000-4000-a000-000000000002' }), 4000);
  assert.throws(() => s.accept(sample(5), 4500));
});
test('collector uses new parsed observations only and keeps independent IDs even at equal values', () => {
  const o = new EEGObservations(), p = values => ({ checksumValid: true, values });
  assert.equal(o.observe({ ...p({ attention: 70 }), checksumValid: false }, 1, 0), false);
  assert.equal(o.observe(p({ eegPower: { delta: 20 } }), 1, 0), false);
  o.observe(p({ attention: 70, meditation: 23, poorSignal: 0 }), 1, 0);
  o.observe(p({ attention: 70 }), 2, 1000);
  const d = o.snapshot(1300); assert.equal(d.seq, 2); assert.equal(d.frame.sampleIds.relaxation, 1); assert.equal(d.frame.ageMs.relaxation, 1300); assert.equal(d.frame.ageMs.attention, 300);
  const stream = d.streamId; o.reset(); assert.notEqual(o.streamId, stream); assert.equal(o.snapshot(), null);
});
test('clock freshness tolerates clock skew, bounds transport, never refreshes without a probe', () => {
  const clock = new EEGClock(); assert.equal(clock.age(1e9, 0), Infinity);
  clock.sync(100, 180, 1e9); assert.equal(clock.age(1e9 + 20, 230), 110);
  assert.equal(clock.sync(0, 3000, 1e9), false); assert.equal(clock.age(1e9, 7000), Infinity);
});
test('session only permits current writer, no replay to new viewers, expires and isolates', () => {
  let now = 1000; const r = new EEGSession({ now: () => now });
  const peer = () => ({ messages: [], send(raw) { this.messages.push(JSON.parse(raw)); }, close() { this.closed = true; } });
  const a = peer(), b = peer(), viewer = peer(), other = new EEGSession({ now: () => now }), isolated = peer();
  r.add(a, 'device', 10000); r.add(viewer, 'viewer', 10000); other.add(isolated, 'viewer', 10000);
  r.message(a, { type: 'ping', protocol: EEG_PROTOCOL, id: 1 });
  const lease = a.messages.at(-1).lease; now = 1100; r.message(a, { ...sample(), lease });
  assert.equal(viewer.messages.filter(d => d.type === 'eeg-frame').length, 1); assert.equal(isolated.messages.length, 1);
  r.add(b, 'device', 10000); r.message(b, { type: 'ping', protocol: EEG_PROTOCOL, id: 1 }); assert.equal(a.closed, true);
  assert.throws(() => r.message(a, { ...sample(2), lease }));
  assert.throws(() => r.message(viewer, sample(2)));
  const fresh = peer(); r.add(fresh, 'viewer', 10000); assert.equal(fresh.messages.length, 1);
  now = 4000; assert.throws(() => r.message(b, { ...sample(2), lease: b.messages.at(-1).lease }));
  assert.equal(r.health().sensorFresh, false); now = 11000; r.expire(); assert.equal(b.closed, true);
});
test('pairing targets are tightly allowlisted and credentials expire', () => {
  const now = Date.now(), base = { protocol: EEG_PROTOCOL, websocket: 'wss://mindscape-demo.aspirincap.workers.dev/ws?role=device', http: 'https://mindscape-demo.aspirincap.workers.dev/api/frame', authorization: `Bearer ${now}.${'a'.repeat(64)}`, expiresAt: now + 86400000 };
  assert.ok(pairingConfig(base));
  const future = now + 3600000;
  assert.ok(pairingConfig({ ...base, authorization: `Bearer ${future}.${'a'.repeat(64)}`, expiresAt: future + 86400000 }), 'pairing must not assume the Mac clock matches the server');
  for (const websocket of ['wss://example.com/ws?role=device', 'ws://169.254.169.254/ws?role=device', 'wss://user@mindscape-demo.aspirincap.workers.dev/ws?role=device', base.websocket + '&token=secret']) assert.throws(() => pairingConfig({ ...base, websocket }));
  assert.throws(() => pairingConfig({ ...base, expiresAt: now }));
});
