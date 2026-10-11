import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { LOCATIONS, latLngToXYZ, locationById } from '../src/core/locations.mjs';
import { chooseWorld, DEFAULT_FRAME } from '../src/core/state.mjs';

test('geographic mapping has correct orientation and stays on a unit sphere', () => {
  assert.deepEqual(latLngToXYZ(0, 0), [0, 0, 1]);
  const east = latLngToXYZ(0, 90); assert.ok(Math.abs(east[0] - 1) < 1e-12);
  for (const location of LOCATIONS) assert.ok(Math.abs(Math.hypot(...latLngToXYZ(location.lat, location.lng)) - 1) < 1e-12);
});

test('all 22 available assets have geographic entrances', async () => {
  const manifest = JSON.parse(await readFile(new URL('../public/worlds/manifest.json', import.meta.url)));
  assert.equal(LOCATIONS.length, 22);
  assert.equal(new Set(LOCATIONS.map(l => l.id)).size, 22);
  for (const location of LOCATIONS) assert.ok(manifest.some(asset => asset.id === location.worldId && asset.count === location.pointCount));
  assert.equal(locationById('missing'), undefined);
});

test('recommendations rank only known destinations, with explicit intent taking precedence', () => {
  for (const [text, id] of [['想去海底', 'scene-01'], ['想去森林', 'scene-02']]) {
    const response = chooseWorld(text, DEFAULT_FRAME);
    assert.equal(response.mode, 'local-rules');
    assert.equal(response.recommendedWorlds.length, 22);
    assert.equal(response.recommendedWorlds[0].locationId, id);
    assert.ok(response.recommendedWorlds[0].score > response.recommendedWorlds[1].score);
    for (const item of response.recommendedWorlds) assert.equal(locationById(item.locationId).worldId, item.worldId);
  }
});

test('local globe is small, valid, and separate from immersive world assets', async () => {
  const buffer = await readFile(new URL('../public/globe/land-points.bin', import.meta.url));
  assert.ok(buffer.length < 500000);
  const points = new Float32Array(buffer.buffer, buffer.byteOffset, buffer.byteLength / 4);
  assert.ok(points.every(Number.isFinite));
  for (let i = 0; i < points.length; i += 3) assert.ok(Math.abs(Math.hypot(points[i], points[i + 1], points[i + 2]) - 1) < 1e-6);
});

test('every named landmark can be explicitly selected by the local router',()=>{for(const l of LOCATIONS){assert.equal(chooseWorld(`想去${l.name}`,DEFAULT_FRAME).world,l.worldId);}});
