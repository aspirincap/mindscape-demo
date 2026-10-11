import { createHash } from 'node:crypto';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DEFAULT_FRAME, SignalProcessor, demoFrame, chooseWorld } from '../src/core/state.mjs';

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

test('60-second timeline traverses fragmentation, recovery and calm', () => {
  assert.equal(demoFrame(0).relaxation, 0.14);
  assert.equal(demoFrame(12).relaxation, 0.14);
  assert.ok(demoFrame(30).relaxation > 0.5);
  assert.ok(demoFrame(45).relaxation > 0.93);
  assert.deepEqual(demoFrame(60), demoFrame(90));
});

test('local router honors an explicit world before its state fallback', () => {
  assert.equal(chooseWorld('想进入雾中森林', { relaxation: 0.1 }).world, 'scene-02');
  assert.equal(chooseWorld('想潜入深海放松', { relaxation: 0.9 }).world, 'scene-01');
  assert.equal(chooseWorld('今天有点累', { relaxation: 0.1 }).world, 'scene-01');
  assert.equal(chooseWorld('nature and trees').mode, 'local-rules');
});
