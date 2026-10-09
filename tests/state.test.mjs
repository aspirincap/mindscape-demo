import { createHash } from 'node:crypto';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DEFAULT_FRAME, validateFrame, SignalProcessor, demoFrame, chooseWorld } from '../src/core/state.mjs';

test('sensor protocol rejects partial, non-numeric and out-of-range frames', () => {
  assert.deepEqual(validateFrame(DEFAULT_FRAME), DEFAULT_FRAME);
  for (const frame of [null, {}, { ...DEFAULT_FRAME, HR: 0 }, { ...DEFAULT_FRAME, relaxation: 76 }, { ...DEFAULT_FRAME, attention: NaN }, { ...DEFAULT_FRAME, signalQuality: '1' }]) assert.throws(() => validateFrame(frame));
});

test('relaxation recovers the world smoothly; attention and HR remain independent', () => {
  const p = new SignalProcessor();
  const frame = { ...DEFAULT_FRAME, relaxation: 0.12, attention: 1, HR: 140 };
  const first = { ...p.update(frame, 0.04) };
  assert.ok(first.coherence > 0.12 && first.coherence < 0.76);
  for (let i = 0; i < 200; i++) p.update(frame, 0.04);
  assert.ok(Math.abs(p.value.coherence - 0.12) < 0.001);
  for (let i = 0; i < 200; i++) p.update({ ...frame, relaxation: 0.96 }, 0.04);
  assert.ok(p.value.coherence > 0.95);
  assert.equal(p.value.tension, 1 - p.value.coherence);
});

test('bad signal holds all visual metrics instead of creating stress', () => {
  const p = new SignalProcessor();
  const before = { ...p.value };
  for (let i = 0; i < 100; i++) p.update({ relaxation: 0, attention: 0, HR: 200, signalQuality: 0.1 }, 0.05);
  for (const key of ['coherence', 'relaxation', 'attention', 'HR']) assert.equal(p.value[key], before[key]);
  assert.equal(p.value.signalQuality, 0.1);
});

test('calibration excludes invalid samples and applies a bounded personal baseline', () => {
  const p = new SignalProcessor(); p.beginCalibration();
  for (let i = 0; i < 40; i++) p.update({ ...DEFAULT_FRAME, signalQuality: 0 }, 0.05);
  assert.equal(p.finishCalibration(), false); assert.equal(p.baseline, null);
  p.beginCalibration();
  for (let i = 0; i < 200; i++) p.update({ ...DEFAULT_FRAME, relaxation: 0.8 }, 0.05);
  assert.equal(p.finishCalibration(), true); assert.ok(Math.abs(p.baseline - 0.8) < 1e-10);
});

test('60-second timeline traverses fragmentation, recovery and calm', () => {
  assert.equal(demoFrame(0).relaxation, 0.14);
  assert.equal(demoFrame(12).relaxation, 0.14);
  assert.ok(demoFrame(30).relaxation > 0.5);
  assert.ok(demoFrame(45).relaxation > 0.93);
  assert.deepEqual(demoFrame(60), demoFrame(90));
});

test('local router honors an explicit world before its state fallback', () => {
  assert.equal(chooseWorld('想进入雾中森林', { relaxation: 0.1 }).world, 'forest');
  assert.equal(chooseWorld('想潜入深海放松', { relaxation: 0.9 }).world, 'abyss');
  assert.equal(chooseWorld('今天有点累', { relaxation: 0.1 }).world, 'abyss');
  assert.equal(chooseWorld('nature and trees').mode, 'local-rules');
});

test('all twelve distinct point assets have valid finite geometry and portable PLY files', async () => {
  const manifest = JSON.parse(await readFile(new URL('../public/worlds/manifest.json', import.meta.url)));
  assert.equal(manifest.length, 12);
  const hashes=new Set();
  for (const world of manifest) {
    const raw = await readFile(new URL(`../public/worlds/${world.id}.bin`, import.meta.url));
    assert.equal(raw.length, world.count * 32);
    hashes.add(createHash('sha256').update(raw).digest('hex'));
    const points = new Float32Array(raw.buffer, raw.byteOffset, raw.byteLength / 4);
    assert.ok(points.every(Number.isFinite));
    const ply = await readFile(new URL(`../public/worlds/${world.id}.ply`, import.meta.url));
    assert.ok(ply.subarray(0, 200).toString().includes(`element vertex ${world.count}`));
  }
  assert.equal(hashes.size,12);
});
