import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { LOCATIONS } from '../src/core/locations.mjs';
import { SCENE_ACTIONS, actionForScene, shouldOpenSceneAction } from '../src/core/scene-actions.mjs';
import { scenePlayback } from '../src/core/scene-tour.mjs';

test('action card becomes eligible after 30 seconds of actual tour playback and waits for other panels', () => {
  const tour = scenePlayback('scene-04');
  for (let i = 0; i < 119; i++) tour.advance(.25);
  assert.equal(shouldOpenSceneAction(tour.snapshot()), false);
  tour.pause();
  for (let i = 0; i < 120; i++) tour.advance(.25);
  assert.equal(tour.snapshot().playedSeconds, 29.75);
  assert.equal(shouldOpenSceneAction(tour.snapshot()), false);
  tour.resume(); tour.advance(.25);
  assert.equal(shouldOpenSceneAction(tour.snapshot(), { available: false }), false);
  assert.equal(shouldOpenSceneAction(tour.snapshot(), { available: true }), true);
  // Closing a shown card, continuing the tour, or restarting cannot prompt again during this visit.
  assert.equal(shouldOpenSceneAction(tour.snapshot(), { shown: true }), false);
  tour.restart(); tour.advance(.25);
  assert.equal(shouldOpenSceneAction(tour.snapshot(), { shown: true }), false);
  assert.equal(shouldOpenSceneAction(scenePlayback('scene-04').snapshot()), false);
});

test('action card never opens from route position alone, manual exploration, or invalid timing', () => {
  for (const tour of [undefined, {}, { status: 'playing', elapsed: 50 },
    { status: 'playing', playedSeconds: NaN }, { status: 'playing', playedSeconds: Infinity },
    { status: 'paused', playedSeconds: 31 }, { status: 'manual', playedSeconds: 31 }]) {
    assert.equal(shouldOpenSceneAction(tour), false);
  }
  assert.equal(shouldOpenSceneAction({ status: 'playing', playedSeconds: 60 }, { shown: true }), false);
});

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
