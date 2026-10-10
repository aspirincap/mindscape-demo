// Local-only validation. BIN contains bytes, not receipt timestamps: intervals below are assumptions.
import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { EEGObservations } from '../server/eeg-observations.mjs';
import { EEGSession } from '../worker/eeg-session.mjs';
import { EEGFeedback, feedbackVisual } from '../src/core/eeg-feedback.mjs';
import { VISUAL_PRESETS } from '../src/core/visual-style.mjs';

const path = process.argv[2];
if (!path) throw new Error('Usage: node scripts/verify-eeg-binary.mjs /absolute/path/to/recording.bin');
const bytes = await readFile(path);
const parsed = spawnSync(process.env.PYTHON || 'python3', ['-c', `
import sys,json
sys.path.insert(0,'scripts')
from thinkgear import ThinkGearParser
data=sys.stdin.buffer.read()
def run(sizes):
 p=ThinkGearParser(); out=[]; offset=0; i=0
 while offset<len(data):
  n=sizes[i%len(sizes)]; out.extend(p.feed(data[offset:offset+n])); offset+=n; i+=1
 return out,p.discarded,len(p.buffer)
whole=run([max(1,len(data))])
for sizes in [[1],[2,3,7,31,128,5],[64],[255]]:
 assert run(sizes)==whole,'incremental parser differs by chunk boundary'
print(json.dumps({'packets':whole[0],'discardedBytes':whole[1],'trailingBytes':whole[2]}))
`], { input: bytes, maxBuffer: 32 * 1024 * 1024 });
assert.equal(parsed.status, 0, parsed.stderr.toString());
const { packets, discardedBytes, trailingBytes } = JSON.parse(parsed.stdout);
assert.ok(packets.length, 'No ThinkGear packets');
const good = packets.filter(p => p.checksumValid && !p.decodeError);
const signal = good.filter(p => p.values.poorSignal === 0 && p.values.attention >= 1 && p.values.attention <= 100 && p.values.meditation >= 1 && p.values.meditation <= 100);

function replay(intervalMs) {
  let now = 100000, delivered = 0, invalid = 0, duplicatesRejected = 0, maxRate = 0, calibration = null;
  const observations = new EEGObservations(), feedback = new EEGFeedback();
  const relay = new EEGSession({ now: () => now, uuid: randomUUID });
  const flags = { connected: true, enabled: true };
  const base = { ...VISUAL_PRESETS.lucid, mode: 'cinematic' };
  const range = { attention: [1, 0], relaxation: [1, 0] };
  const tick = next => {
    const before = { ...feedback.controls }, elapsed = (next - now) / 1000;
    now = next; feedback.tick(now, flags);
    for (const k of Object.keys(range)) {
      const delta = Math.abs(feedback.controls[k] - before[k]);
      if (elapsed > 0) { maxRate = Math.max(maxRate, delta / elapsed); assert.ok(delta <= .1 * elapsed + 1e-10); }
      assert.ok(Number.isFinite(feedback.controls[k]));
      range[k][0] = Math.min(range[k][0], feedback.controls[k]); range[k][1] = Math.max(range[k][1], feedback.controls[k]);
    }
    const visual = feedbackVisual(base, feedback.value, true);
    assert.equal(visual.geoLocked, true); assert.equal(visual.dispersion, base.dispersion);
    assert.ok(visual.brightness >= .5 && visual.brightness <= 2);
    if (feedback.calibration.state === 'complete' && !calibration) calibration = { elapsed: feedback.calibration.elapsed, counts: feedback.value.calibration.counts };
  };
  relay.add({ send(raw) {
    const msg = JSON.parse(raw); if (msg.type !== 'eeg-frame') return;
    delivered++;
    assert.equal(msg.frame.HR, null); assert.equal(msg.capabilities.heartRate, false);
    assert.equal(msg.frame.eegPower, undefined); assert.equal(msg.raw16, undefined);
    assert.ok(feedback.ingest(msg, now, 0));
    const counts = { ...feedback.value.calibration.counts };
    assert.equal(feedback.ingest(msg, now, 0), false); duplicatesRejected++;
    assert.deepEqual(feedback.value.calibration.counts, counts);
    tick(now);
    if (!msg.frame.valid.attention && !msg.frame.valid.relaxation) {
      invalid++; assert.equal(feedback.value.attention, null); assert.equal(feedback.value.relaxation, null);
      const before = { ...feedback.controls }, count = feedback.calibration.samples.attention.length;
      tick(now + 100); assert.deepEqual(feedback.controls, before); assert.equal(feedback.calibration.samples.attention.length, count);
    } else if (feedback.calibration.state === 'idle') feedback.beginCalibration();
  }, close() {} }, 'viewer', Number.MAX_SAFE_INTEGER);
  for (let i = 0; i < packets.length; i++) {
    const target = 100000 + i * intervalMs;
    while (now < target) tick(Math.min(target, now + 50));
    if (observations.observe(packets[i], 1700000000000 + i * intervalMs, now)) {
      const claim = relay.httpClaim(); relay.receive(claim.connectionId, { ...observations.snapshot(now), lease: claim.lease });
    }
  }
  const beforePause = { ...feedback.controls }, counts = feedback.calibration.samples.attention.length;
  feedback.tick(now, { ...flags, paused: true }); feedback.tick(now + 1000, { ...flags, paused: true });
  assert.deepEqual(feedback.controls, beforePause); assert.equal(feedback.calibration.samples.attention.length, counts);
  feedback.tick(now + 2600, flags); assert.deepEqual(feedback.controls, beforePause);
  feedback.tick(now + 11000, { connected: false, enabled: true }); assert.equal(feedback.autoPaused, true);
  assert.equal(delivered, good.filter(p => ['attention', 'meditation', 'poorSignal'].some(k => k in p.values)).length);
  if (signal.length >= 40) assert.ok(calibration, 'Expected sustained valid data to permit calibration at this assumed cadence');
  return { assumedIntervalMs: intervalMs, simulatedDurationMs: (packets.length - 1) * intervalMs, delivered, invalid, duplicatesRejected, calibration, controlRange: range, maxControlChangePerSecond: maxRate };
}
const report = {
  serialOpened: false, networkUsed: false, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'),
  packets: packets.length, badChecksums: packets.filter(p => !p.checksumValid).length,
  decodeErrors: packets.filter(p => p.decodeError).length, discardedBytes, trailingBytes,
  validContactAndMetrics: signal.length, invalidContactOrMetrics: good.length - signal.length,
  raw16Samples: good.reduce((n, p) => n + p.raw16.length, 0),
  timing: 'BIN has no receipt timestamps. 0.5/1/2 seconds per packet are sensitivity scenarios, not measured duration or latency.',
  scenarios: [500, 1000, 2000].map(replay),
  checks: ['checksum and decode', 'identical parse across five chunk patterns', 'v2 observation → in-memory relay → feedback', 'duplicate rejection', 'invalid readings freeze and do not calibrate', 'valid independent sample calibration', 'bounded smooth controls and locked terrain', 'no HR invented or raw bands forwarded', 'pause, stale freeze and offline pause'],
};
await mkdir('artifacts/eeg', { recursive: true });
await writeFile('artifacts/eeg/binary-summary.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
