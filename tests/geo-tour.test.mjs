import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildTour, TourPlayback, tourVisual, blendVisual, clearGeoVisual, terrainEdgeOpacity } from '../src/core/geo-tour.mjs';
import { sampleElevation } from '../src/core/geo-navigation.mjs';
import { VISUAL_PRESETS } from '../src/core/visual-style.mjs';

for (const id of ['fuji', 'grand-canyon']) test(`${id}: complete flight stays above real terrain with a continuous loop and restrained banking`, async context => {
  const meta = JSON.parse(await readFile(`public/terrain/${id}/manifest.json`));
  const b = await readFile(`public/terrain/${id}/height.f32`), heights = new Float32Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
  const route = buildTour(meta, heights), dt = 1 / 30;
  let previous = route.pose(0), minClearance = Infinity, maxStep = 0;
  for (let time = dt; time <= route.duration + dt; time += dt) {
    const pose = route.pose(time), [x, y, z] = pose.position;
    assert.ok([...pose.position, ...pose.look, pose.bank].every(Number.isFinite));
    assert.ok(Math.abs(x) < meta.width * .42 && Math.abs(z) < meta.depth * .42);
    const clearance = y - sampleElevation(meta, heights, x, z); minClearance = Math.min(minClearance, clearance);
    assert.ok(clearance > 450, `insufficient clearance at ${time}: ${clearance}`);
    const step = Math.hypot(...pose.position.map((v, i) => v - previous.position[i])); maxStep = Math.max(maxStep, step);
    assert.ok(step < 15, `camera jump at ${time}: ${step}`);
    assert.ok(Math.abs(pose.bank) <= .085 && Math.abs(pose.bank - previous.bank) < .012);
    assert.ok(pose.position[1] > pose.look[1]);
    previous = pose;
  }
  assert.deepEqual(route.pose(0), route.pose(route.duration));
  context.diagnostic(`Minimum terrain clearance ${minClearance.toFixed(1)} m; maximum 30 Hz camera step ${maxStep.toFixed(2)} m; route ${(route.total/1000).toFixed(1)} km`);
  const playback = new TourPlayback(route), original = playback.time;
  playback.advance(2); assert.equal(playback.time, original); // a suspended frame never fast-forwards
  playback.advance(.1); assert.equal(playback.time, .1);
  playback.pause(); const held = playback.advance(.1); assert.equal(playback.time, .1);
  assert.deepEqual(playback.advance(.1), held);
  playback.resume(); playback.advance(.1, false); playback.advance(.1, true, true); assert.equal(playback.time, .1);
  playback.manual(); playback.advance(.1); assert.equal(playback.time, .1);
  playback.restart(); assert.equal(playback.time, 0); assert.equal(playback.status, 'playing');
  assert.equal(new TourPlayback(route, true).status, 'paused');
});

test('tour starts clear, colour and light change continuously and preserve the manual baseline', () => {
  const first = tourVisual(0), last = tourVisual(1);
  assert.equal(first.paletteMix, 0); assert.equal(first.bloom, VISUAL_PRESETS.lucid.bloom);
  assert.deepEqual(first, last);
  let previous = first;
  for (let i = 1; i <= 10000; i++) {
    const v = tourVisual(i / 10000);
    for (const key of ['paletteMix', 'brightness', 'bloom', 'pointSize', 'flow', 'dispersion']) {
      assert.ok(Number.isFinite(v[key])); assert.ok(Math.abs(v[key] - previous[key]) < .003);
    }
    previous = v;
  }
  const manual = clearGeoVisual(), saved = { ...manual }, target = { ...VISUAL_PRESETS.dream, mode: 'cinematic' };
  const blended = blendVisual(manual, target, .016);
  assert.ok(blended.bloom > manual.bloom && blended.bloom < target.bloom);
  assert.ok(blended.paletteMix > 0 && blended.paletteMix < 2);
  assert.deepEqual(manual, saved); assert.deepEqual(blendVisual(blended, target, 0), { ...blended, ...Object.fromEntries(['mode','palette','name','note'].filter(k => k in target).map(k => [k,target[k]])) });
});

test('rounded edge mask preserves the centre and fades to zero at all four boundaries and corners', () => {
  const w = 24000, d = 26000;
  assert.equal(terrainEdgeOpacity(0, 0, w, d), 1);
  for (const [x, z] of [[w/2,0],[-w/2,0],[0,d/2],[0,-d/2],[w/2,d/2]]) assert.equal(terrainEdgeOpacity(x,z,w,d),0);
  let last = 1;
  for (let t = 0; t <= 1; t += .001) {
    const fade = terrainEdgeOpacity(t*w/2,0,w,d);
    assert.ok(fade <= last + 1e-10 && fade >= 0); last = fade;
  }
  assert.ok(terrainEdgeOpacity(w*.42,d*.42,w,d)<terrainEdgeOpacity(w*.42,0,w,d));
});
