import test from 'node:test';
import assert from 'node:assert/strict';
import { EEGFeedback, feedbackVisual } from '../src/core/eeg-feedback.mjs';
import { DEFAULT_VISUAL } from '../src/core/visual-style.mjs';
import { sample } from './eeg-fixture.mjs';
const ready = () => { const p = new EEGFeedback(); for (let i = 1; i <= 3; i++) { p.tick(i * 1000, { connected: true, enabled: true }); p.ingest(sample(i), i * 1000); p.tick(i * 1000); } return p; };
test('one observation rendered 600 times remains one independent sample', () => {
  const p = ready(); p.beginCalibration(); p.ingest(sample(4), 4000);
  for (let i = 0; i < 600; i++) p.tick(4000 + i * 10);
  assert.equal(p.calibration.samples.attention.length, 1); assert.equal(p.calibration.samples.relaxation.length, 1);
  assert.equal(p.baseline, null);
});
test('calibration needs 30 active seconds and 25 samples per field; median/MAD fixed until recalibration', () => {
  const p = ready(); assert.equal(p.beginCalibration(), true);
  for (let i = 4; i <= 33; i++) { p.tick(i * 1000); p.ingest(sample(i), i * 1000); }
  p.tick(34000); assert.equal(p.calibration.state, 'complete'); assert.equal(p.baseline.relaxation.median, .23); assert.equal(p.baseline.relaxation.scale, .12);
  const baseline = p.baseline; const d = sample(34); d.frame.relaxation = .9; p.ingest(d, 34000); p.tick(35000); assert.equal(p.baseline, baseline);
});
test('partial updates, invalid values, heartbeat and duplicate packets cannot count old relaxation', () => {
  const p = ready(); p.beginCalibration();
  for (let i = 4; i <= 70; i++) { const d = sample(i); d.frame.sampleIds.relaxation = 3; p.tick(i * 1000); p.ingest(d, i * 1000); }
  assert.equal(p.calibration.samples.relaxation.length, 0); assert.equal(p.calibration.state, 'failed'); assert.equal(p.value.relaxation, null);
});
test('pause and hidden tabs freeze calibration time and outputs without a resume jump', () => {
  const p = ready(); p.beginCalibration(); p.tick(4000, { paused: true }); const time = p.calibration.elapsed, output = p.controls.attention;
  for (let i = 5; i <= 30; i++) { p.ingest(sample(i), i * 1000); p.tick(i * 1000); }
  assert.equal(p.calibration.elapsed, time); assert.equal(p.controls.attention, output); assert.equal(p.calibration.samples.attention.length, 0);
  p.tick(60000, { paused: false, hidden: true }); p.tick(120000, { hidden: false }); assert.equal(p.calibration.elapsed, time); assert.equal(p.controls.attention, output);
});
test('poor contact and stale fields freeze feedback, no HR fabrication, stream change clears baseline', () => {
  const p = ready(); const d = sample(4); d.frame.poorSignal = 200; p.ingest(d, 4000); const before = p.controls.relaxation;
  p.tick(4100); assert.equal(p.value.relaxation, null); assert.equal(p.value.HR, null); p.tick(8000); assert.equal(p.controls.relaxation, before);
  p.tick(15000); assert.equal(p.autoPaused, true); p.baseline = { marker: true };
  p.ingest(sample(1, { streamId: '00000000-0000-4000-a000-000000000099' }), 16000); assert.equal(p.baseline, null);
});
test('time based smoothing is independent of render rate and limited to .10 per second', () => {
  function simulate(fps) { const p = ready(); let seq = 3; for (let t = 3000; t <= 12000; t += 1000 / fps) { if (Math.floor((t + .001) / 1000) > seq) { seq++; const d = sample(seq); d.frame.relaxation = 1; p.ingest(d, t); } const before = p.controls.relaxation; p.tick(t); assert.ok(Math.abs(p.controls.relaxation - before) <= .1 / fps + .001); } return p.controls.relaxation; }
  assert.ok(Math.abs(simulate(30) - simulate(120)) < .005);
});
test('neutral raw view, no mutation of manual settings, reduced motion and geographic bounds', () => {
  const base = { ...DEFAULT_VISUAL }, state = { source: 'device', feedbackMix: 1, relaxationControl: .9, attentionControl: .9 };
  const processed = feedbackVisual(base, state, true); assert.equal(processed.flow, base.flow); assert.equal(processed.speed, base.speed); assert.equal(processed.dispersion, base.dispersion); assert.equal(processed.geoLocked, true); assert.notEqual(processed.accentGain, 1);
  assert.deepEqual(base, DEFAULT_VISUAL); assert.equal(feedbackVisual({ ...base, mode: 'original' }, state).brightness, base.brightness); assert.equal(feedbackVisual(base, state, false, true).eegMix, 0);
});
