import test from 'node:test';
import assert from 'node:assert/strict';
import { EEGFeedback } from '../src/core/eeg-feedback.mjs';
import { sceneEEGReadout } from '../src/core/eeg-readout.mjs';
import { sample } from './eeg-fixture.mjs';

const connection = { connected: true, bridge: true, serial: 'connected' };
function ready() {
  const processor = new EEGFeedback();
  for (let seq = 1; seq <= 3; seq++) {
    processor.tick(seq * 1000, { connected: true, enabled: true });
    processor.ingest(sample(seq), seq * 1000);
    processor.tick(seq * 1000);
  }
  return processor;
}

test('scene scores use original device readings, independent of calibrated visual controls', () => {
  const processor = ready();
  processor.controls = { attention: .92, relaxation: .81 };
  processor.baseline = { attention: { median: .7, scale: .12 }, relaxation: { median: .23, scale: .12 } };
  const live = processor.tick(3000);
  const readout = sceneEEGReadout('device', live, connection);
  assert.equal(readout.attention, 70);
  assert.equal(readout.meditation, 23);
  assert.equal(readout.status, '实时设备读数');
  assert.equal(sceneEEGReadout('simulator', live, connection).hasReading, false);
  assert.equal(sceneEEGReadout('device', { ...live, source: 'simulator' }, connection).hasReading, false);
});

test('scene scores clear on contact loss, expiry or disconnect instead of showing held effects', () => {
  const processor = ready();
  const invalid = sample(4);
  invalid.frame.poorSignal = 200;
  processor.ingest(invalid, 4000);
  let readout = sceneEEGReadout('device', processor.tick(4000), connection);
  assert.deepEqual([readout.attention, readout.meditation, readout.status], [null, null, '接触待调整']);
  processor.ingest(sample(5), 5000);
  readout = sceneEEGReadout('device', processor.tick(7500), connection);
  assert.deepEqual([readout.attention, readout.meditation, readout.status], [null, null, '读数已过期']);
  const fresh = ready().value;
  for (const disconnected of [{ connected: false }, { bridge: false }, { serial: 'disconnected' }]) {
    assert.equal(sceneEEGReadout('device', fresh, { ...connection, ...disconnected }).hasReading, false);
  }
  for (const value of [null, 0, NaN, Infinity, 1.01, '0.7']) {
    assert.equal(sceneEEGReadout('device', { ...fresh, attention: value }, connection).attention, null);
  }
});

test('paused visuals still display new measurements and each score expires independently', () => {
  const processor = ready();
  processor.tick(4000, { paused: true, enabled: false });
  const controls = { ...processor.controls };
  const next = sample(4); next.frame.attention = .86; next.frame.relaxation = .17;
  processor.ingest(next, 4000);
  let readout = sceneEEGReadout('device', processor.tick(4000), connection);
  assert.deepEqual([readout.attention, readout.meditation], [86, 17]);
  assert.deepEqual(processor.controls, controls);
  const partial = sample(5); partial.frame.attention = .92; partial.frame.relaxation = .17; partial.frame.sampleIds.relaxation = 4;
  processor.ingest(partial, 6100);
  readout = sceneEEGReadout('device', processor.tick(6500), connection);
  assert.deepEqual([readout.attention, readout.meditation], [92, null]);
  assert.equal(readout.status, '部分读数无效或过期');
});
