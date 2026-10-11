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
        if (mode === 'broken') return Promise.reject(new Error('decode failed'));
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

test('a blocked scene track waits for a gesture without repeated downloads or turning off the preference', async t => {
  const { engine, media, errors } = harness(['ready', 'fail', 'ready']); t.after(() => engine.dispose());
  await engine.start('scene-02'); engine.update(frame, 'scene-06', true); await flush();
  assert.equal(engine.enabled, false); assert.equal(engine.awaitingGesture, true); assert.equal(errors.length, 0);
  for (let i = 0; i < 20; i++) engine.update(frame, 'scene-06', true);
  assert.equal(media.length, 2);
  await engine.start('scene-06'); engine.update(frame, 'scene-06', true);
  assert.equal(engine.awaitingGesture, false); assert.equal(engine.enabled, true);
  assert.equal(engine.active.track.id, 'leaves'); assert.equal(media.length, 3);
});

test('onboarding unlocks the audio context silently without fetching any tracks', async t => {
  const { engine, context, media } = harness(); t.after(() => engine.dispose());
  await engine.unlock();
  assert.equal(context.state, 'running'); assert.equal(engine.master.gain.value, 0);
  assert.equal(media.length, 0); assert.equal(engine.enabled, false);
  engine.update(frame, 'scene-02', false);
  assert.equal(media.length, 0);
  await engine.start('scene-02'); engine.update(frame, 'scene-02', true);
  assert.equal(media.length, 1); assert.ok(engine.master.gain.value > 0);
});

test('first-load autoplay denial can recover on the next gesture', async t => {
  const { engine, media, errors } = harness(['fail', 'ready']); t.after(() => engine.dispose());
  await engine.start('scene-02').catch(error => engine.fail(error));
  assert.equal(engine.awaitingGesture, true); assert.equal(errors.length, 0);
  engine.update(frame, 'scene-02', true);
  assert.equal(media.length, 1); assert.equal(media[0].unloaded, true);
  await engine.start('scene-02'); engine.update(frame, 'scene-02', true);
  assert.equal(engine.awaitingGesture, false); assert.ok(engine.master.gain.value > 0);
});

test('a later gesture resumes a pending context without downloading the same track twice', async t => {
  const { engine, context, media } = harness(['wait']); t.after(() => engine.dispose());
  let releaseResume, calls = 0;
  context.resume = () => {
    if (++calls === 1) return new Promise(resolve => { releaseResume = resolve; });
    context.state = 'running'; releaseResume(); return Promise.resolve();
  };
  const automatic = engine.start('scene-02');
  assert.equal(context.state, 'suspended'); assert.equal(media.length, 1);
  const gesture = engine.start('scene-02');
  assert.equal(context.state, 'running'); assert.equal(media.length, 1);
  media[0].finish(); await Promise.all([automatic, gesture]);
  assert.equal(engine.active.media, media[0]);
});

test('unlocking or completing an old startup cannot unmute a paused scene', async t => {
  const { engine, context, media } = harness(['wait']); t.after(() => engine.dispose());
  let resume;
  context.resume = () => new Promise(resolve => { resume = resolve; });
  const automatic = engine.start('scene-02');
  engine.setEnabled(false);
  context.state = 'running'; resume(); await automatic;
  await engine.unlock(); engine.update(frame, 'scene-02', false);
  assert.equal(engine.enabled, false); assert.equal(engine.master.gain.value, 0);
  assert.equal(media[0].paused, true); assert.equal(media[0].unloaded, true);
  assert.equal(engine.active, undefined);
});

test('real playback failures still report an error and allow manual recovery', async t => {
  const { engine, errors } = harness(['broken', 'ready']); t.after(() => engine.dispose());
  await engine.start('scene-02').catch(error => engine.fail(error));
  assert.equal(errors.length, 1); assert.match(errors[0], /播放失败/);
  assert.equal(engine.enabled, false); assert.equal(engine.awaitingGesture, false);
  await engine.start('scene-02'); assert.equal(engine.enabled, true);
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
