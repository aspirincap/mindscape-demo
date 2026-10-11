import test from 'node:test';
import assert from 'node:assert/strict';
import { stat } from 'node:fs/promises';
import { AudioEngine } from '../src/audio.js';
import { AUDIO_TRACKS, SCENE_AUDIO, audioLevel, loopEnvelope, trackForWorld } from '../src/core/audio-tracks.mjs';
import { LOCATIONS } from '../src/core/locations.mjs';

const frame = { source: 'simulator', coherence: .5 };
const flush = () => new Promise(resolve => setImmediate(resolve));
function harness(modes = []) {
  const media = [], errors = [];
  const param = () => ({ value: 0, setTargetAtTime(v) { this.value = v; }, setValueAtTime(v) { this.value = v; }, linearRampToValueAtTime(v) { this.value = v; }, cancelAndHoldAtTime() {} });
  const node = () => ({ gain: param(), connect() {}, disconnect() { this.disconnected = true; } });
  const context = { currentTime: 10, destination: {}, state: 'suspended', createGain: node, createMediaElementSource: node, async resume() { this.state = 'running'; }, async close() { this.state = 'closed'; } };
  const engine = new AudioEngine({ contextFactory: () => context, onError: error => errors.push(error), mediaFactory: () => {
    const mode = modes[media.length];
    const item = { paused: true, currentTime: 12, duration: 60, playCalls: 0,
      play() {
        this.playCalls++; this.paused = false;
        if (mode === 'wait') return new Promise(resolve => { this.finish = resolve; });
        if (mode === 'fail') return Promise.reject(Object.assign(new Error('blocked'), { name: 'NotAllowedError' }));
        return Promise.resolve();
      }, pause() { this.paused = true; }, removeAttribute(key) { delete this[key]; }, load() { this.unloaded = true; },
    };
    media.push(item); return item;
  } });
  return { engine, media, context, errors };
}

test('all 22 scenes map to supplied audio assets, including the four numbered soundscapes', async () => {
  assert.equal(Object.keys(SCENE_AUDIO).length, LOCATIONS.length);
  for (const place of LOCATIONS) assert.ok(AUDIO_TRACKS[SCENE_AUDIO[place.worldId]], place.worldId);
  assert.deepEqual(['scene-06', 'scene-17', 'scene-19', 'scene-20'].map(id => trackForWorld(id).id), ['leaves', 'arctic', 'polar', 'tent']);
  assert.equal(new Set(Object.values(SCENE_AUDIO)).size, 8);
  for (const track of Object.values(AUDIO_TRACKS)) assert.ok((await stat(new URL(`../public${track.src}`, import.meta.url))).size > 100000);
});

test('audio is lazy, shared scene tracks keep position, and mute resumes the same media', async t => {
  const { engine, media } = harness(); t.after(() => engine.dispose());
  engine.update(frame, 'scene-02', false); assert.equal(media.length, 0);
  await engine.start('scene-02'); engine.update(frame, 'scene-04', true);
  assert.equal(media.length, 1); assert.equal(media[0].currentTime, 12); assert.equal(media[0].loop, true);
  engine.setEnabled(false); await new Promise(resolve => setTimeout(resolve, 140));
  assert.equal(media[0].paused, true);
  await engine.start('scene-04'); assert.equal(media[0].paused, false); assert.equal(media.length, 1);
});

test('rapid scene changes discard late downloads and retain old audio until the new track starts', async t => {
  const { engine, media } = harness(['ready', 'wait', 'ready']); t.after(() => engine.dispose());
  await engine.start('scene-02'); engine.update(frame, 'scene-06', true);
  assert.equal(engine.active.track.id, 'stream');
  engine.update(frame, 'scene-19', true); await flush();
  assert.equal(engine.active.track.id, 'polar'); assert.equal(media[1].unloaded, true);
  media[1].finish(); await flush();
  assert.equal(engine.active.track.id, 'polar'); assert.equal(media.length, 3);
});

test('muting during load cancels playback; disposal cannot be resurrected by a late load', async () => {
  const { engine, media, context } = harness(['wait']);
  const start = engine.start('scene-02'); engine.setEnabled(false); await start;
  assert.equal(engine.active, undefined); assert.equal(media[0].paused, true);
  engine.dispose(); media[0].finish(); await flush();
  assert.equal(engine.active, null); assert.equal(context.state, 'closed'); assert.equal(media[0].unloaded, true);
});

test('a blocked scene track stops audio and reports one retryable error', async t => {
  const { engine, errors } = harness(['ready', 'fail']); t.after(() => engine.dispose());
  await engine.start('scene-02'); engine.update(frame, 'scene-06', true); await flush();
  assert.equal(engine.enabled, false); assert.equal(errors.length, 1); assert.match(errors[0], /再次点击/);
});

test('volume and EEG are bounded, and loop ends taper without changing playback speed', () => {
  assert.equal(audioLevel(frame, 0), 0); assert.equal(audioLevel(frame, NaN), 0);
  assert.equal(audioLevel({ source: 'device', feedbackMix: 0, relaxationControl: 1 }, 1), .7);
  assert.ok(audioLevel({ source: 'device', feedbackMix: 1, relaxationControl: 1 }, 1) < .75);
  assert.equal(loopEnvelope(0, 60), 0); assert.equal(loopEnvelope(60, 60), 0); assert.equal(loopEnvelope(30, 60), 1);
  assert.equal(loopEnvelope(0, NaN), 1);
});

test('a stream error releases the broken element so a later click can retry', async t => {
  const { engine, media, errors } = harness(); t.after(() => engine.dispose());
  await engine.start('scene-02'); media[0].onerror();
  assert.equal(engine.active, null); assert.equal(engine.enabled, false);
  assert.equal(media[0].unloaded, true); assert.equal(errors.length, 1);
  await engine.start('scene-02');
  assert.equal(media.length, 2); assert.equal(engine.active.media, media[1]);
});
