// Opt-in local replay only. Never opens serial, contacts a cloud endpoint, or writes raw readings.
import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { EEGObservations } from '../server/eeg-observations.mjs';
import { EEGSession } from '../worker/eeg-session.mjs';
import { EEGFeedback } from '../src/core/eeg-feedback.mjs';

const path = process.argv[2];
if (!path) throw new Error('Usage: node scripts/verify-eeg-history.mjs /absolute/path/to/eeg-export.jsonl');
const rows = (await readFile(path, 'utf8')).trim().split('\n').filter(Boolean).map(JSON.parse);
assert.ok(rows.length && rows.every(r => r.type === 'data' && Number.isFinite(r.timestamp) && typeof r.hex === 'string'));
// Re-run the actual incremental byte parser, including the original chunk boundaries.
const parser = spawnSync(process.env.PYTHON || 'python3', ['-c', `
import sys,json
sys.path.insert(0,'scripts')
from thinkgear import ThinkGearParser
p=ThinkGearParser()
print(json.dumps([p.feed(bytes.fromhex(r['hex'])) for r in json.load(sys.stdin)]))
`], { input: JSON.stringify(rows), encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
assert.equal(parser.status, 0, parser.stderr);
const packets = JSON.parse(parser.stdout);
for (let i = 0; i < rows.length; i++) assert.deepEqual(packets[i], rows[i].packets, `Parser mismatch at serial chunk ${i + 1}`);
const observations = new EEGObservations(), feedback = new EEGFeedback();
let now = 100000, delivered = 0, validA = 0, validR = 0, badChecksums = 0, invalid = 0;
const relay = new EEGSession({ now: () => now, uuid: randomUUID });
const viewer = { send(raw) { const data = JSON.parse(raw); if (data.type !== 'eeg-frame') return;
  delivered++;
  assert.equal(data.frame.HR, null); assert.equal(data.capabilities.heartRate, false);
  assert.equal(data.frame.eegPower, undefined); assert.equal(data.raw16, undefined);
  const before = { ...feedback.controls };
  assert.ok(feedback.ingest(data, now, 0));
  const value = feedback.tick(now, { connected: true, enabled: true });
  if (value.validity.attention) validA++;
  if (value.validity.relaxation) validR++;
  if (!value.validity.attention && !value.validity.relaxation) {
    invalid++; assert.deepEqual(feedback.controls, before); assert.equal(feedback.beginCalibration(), false);
    assert.equal(value.attention, null); assert.equal(value.relaxation, null);
  }
}, close() {} };
relay.add(viewer, 'viewer', Number.MAX_SAFE_INTEGER);
let previous = rows[0].timestamp;
for (let i = 0; i < rows.length; i++) {
  assert.ok(rows[i].timestamp >= previous); previous = rows[i].timestamp;
  now = 100000 + rows[i].timestamp - rows[0].timestamp;
  feedback.tick(now, { connected: true, enabled: true });
  for (const packet of packets[i]) {
    if (!packet.checksumValid) badChecksums++;
    if (!observations.observe(packet, rows[i].timestamp, now)) continue;
    const claim = relay.httpClaim(), data = observations.snapshot(now);
    relay.receive(claim.connectionId, { ...data, lease: claim.lease });
  }
}
assert.ok(delivered > 0);
const atEnd = { ...feedback.controls };
feedback.tick(now + 2600, { connected: true, enabled: true }); assert.deepEqual(feedback.controls, atEnd);
feedback.tick(now + 11000, { connected: false, enabled: true }); assert.equal(feedback.autoPaused, true);
if (!validA && !validR) {
  assert.deepEqual(feedback.controls, { attention: .5, relaxation: .5 });
  assert.equal(feedback.mix, 0); assert.equal(feedback.baseline, null);
  assert.equal(feedback.calibration.samples.attention.length, 0); assert.equal(feedback.calibration.samples.relaxation.length, 0);
}
const report = { mode: 'local historical replay with original timing on a virtual clock', serialOpened: false, networkUsed: false,
  recordedDurationMs: rows.at(-1).timestamp - rows[0].timestamp, chunks: rows.length, packets: packets.flat().length,
  badChecksums, delivered, validAttention: validA, validRelaxation: validR, invalidReadings: invalid,
  checks: ['raw chunk parser matches export', 'v2 observation → relay → feedback', 'invalid readings do not drive controls or start calibration', 'no invented HR or raw band forwarding', 'stale freeze and offline pause'] };
await mkdir('artifacts/eeg', { recursive: true }); await writeFile('artifacts/eeg/history-summary.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
