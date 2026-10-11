import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { LOCATIONS } from '../src/core/locations.mjs';
import { SCENE_ACTIONS, actionForScene } from '../src/core/scene-actions.mjs';

test('every scene has a destination-specific action card and a deployable cover', async () => {
  assert.deepEqual(Object.keys(SCENE_ACTIONS).sort(), LOCATIONS.map(place => place.id).sort());
  assert.equal(new Set(Object.values(SCENE_ACTIONS).map(card => card.headline.join(''))).size, LOCATIONS.length);
  for (const place of LOCATIONS) {
    const card = actionForScene(place.id);
    assert.ok(card.activity.startsWith(place.name), `${place.id} must describe its own destination`);
    assert.ok(card.description && card.hint && card.moments.length);
    const image = card.image.startsWith('file:') ? new URL(card.image) : new URL(`../public${card.image}`, import.meta.url);
    const bytes = await readFile(image);
    assert.equal(bytes.toString('ascii', 0, 4), 'RIFF', `${place.id} cover must be a WebP`);
    assert.equal(bytes.toString('ascii', 8, 12), 'WEBP');
    assert.ok(bytes.length > 1000, `${place.id} cover must not be empty`);
  }
  assert.equal(actionForScene('missing-scene'), undefined);
  assert.equal(actionForScene('__proto__'), undefined);
});
