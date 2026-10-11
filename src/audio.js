import { audioLevel, loopEnvelope, trackForWorld } from './core/audio-tracks.mjs';

export class AudioEngine {
  constructor({ contextFactory, mediaFactory, onError } = {}) {
    this.contextFactory = contextFactory || (() => {
      const Context = window.AudioContext || window.webkitAudioContext;
      if (!Context) throw new Error('当前浏览器不支持环境音频。');
      return new Context();
    });
    this.mediaFactory = mediaFactory || (() => new Audio());
    this.onError = onError;
    this.enabled = false;
    this.sequence = 0;
  }

  async start(world) {
    if (this.disposed) return;
    if (!this.context) {
      this.context = this.contextFactory();
      this.master = this.context.createGain();
      this.master.gain.value = 0;
      this.master.connect(this.context.destination);
    }
    this.setEnabled(true);
    // Start resume and play inside the user's click, before the first await.
    await Promise.all([this.context.resume(), this.select(trackForWorld(world))]);
  }

  setEnabled(enabled) {
    if (this.enabled === enabled || this.disposed) return;
    this.enabled = enabled;
    clearTimeout(this.pauseTimer);
    if (!enabled) {
      this.cancelPending();
      this.release(this.retiring); this.retiring = null;
      if (this.master) this.master.gain.setTargetAtTime(0, this.context.currentTime, .025);
      this.pauseTimer = setTimeout(() => { if (!this.enabled) this.active?.media.pause(); }, 120);
    }
  }

  update(state, world, enabled, volume = .5) {
    if (!this.context || this.disposed) return;
    this.setEnabled(enabled);
    const now = this.context.currentTime;
    this.master.gain.setTargetAtTime(enabled ? audioLevel(state, volume) : 0, now, enabled ? .25 : .025);
    if (!enabled) return;
    const track = trackForWorld(world);
    if (this.pending?.track.id !== track.id && (this.active?.track.id !== track.id || this.pending)) {
      this.select(track).catch(error => this.fail(error));
    } else if (!this.pending && this.active?.media.paused && !this.resuming) {
      const deck = this.active;
      this.resuming = deck.media.play().catch(error => {
        if (this.enabled && this.active === deck && !this.disposed) this.fail(error);
      }).finally(() => { this.resuming = null; });
    }
    for (const deck of [this.active, this.retiring]) {
      if (deck) deck.level.gain.setTargetAtTime(deck.track.gain * loopEnvelope(deck.media.currentTime, deck.media.duration), now, .08);
    }
  }

  async select(track) {
    this.cancelPending();
    if (this.active?.track.id === track.id) return this.active.media.play();
    const sequence = ++this.sequence;
    const ctx = this.context, media = this.mediaFactory();
    const level = ctx.createGain(), fade = ctx.createGain();
    level.gain.value = track.gain; fade.gain.value = 0;
    media.preload = 'auto'; media.loop = true;
    const source = ctx.createMediaElementSource(media);
    source.connect(level); level.connect(fade); fade.connect(this.master);
    const deck = { track, media, source, level, fade };
    this.pending = deck;
    media.onerror = () => {
      if (this.active === deck) {
        this.active = null; this.release(deck);
        this.fail(new Error(`「${track.name}」加载失败，请重新开启环境音。`));
      }
    };
    media.src = track.src;
    try {
      await Promise.race([
        media.play(),
        new Promise((_, reject) => { deck.timeout = setTimeout(() => reject(new Error(`「${track.name}」加载超时，请重新开启环境音。`)), 20000); }),
        new Promise(resolve => { deck.cancel = resolve; }),
      ]);
      if (sequence !== this.sequence || !this.enabled || this.disposed) { this.release(deck); return; }
      this.pending = null;
      this.release(this.retiring);
      const previous = this.active;
      this.active = deck; this.retiring = previous;
      const now = ctx.currentTime;
      fade.gain.setValueAtTime(0, now);
      fade.gain.linearRampToValueAtTime(1, now + 1.5);
      if (previous) {
        this.hold(previous.fade.gain, now);
        previous.fade.gain.linearRampToValueAtTime(0, now + 1.5);
        previous.cleanup = setTimeout(() => {
          this.release(previous);
          if (this.retiring === previous) this.retiring = null;
        }, 1600);
      }
    } catch (error) {
      const current = sequence === this.sequence && this.enabled && !this.disposed;
      if (this.pending === deck) this.pending = null;
      this.release(deck);
      if (current) throw new Error(error.name === 'NotAllowedError' ? '浏览器暂停了声音，请再次点击开启环境音。' : `「${track.name}」播放失败，请重新开启环境音。`);
    } finally { clearTimeout(deck.timeout); }
  }

  hold(param, now) {
    if (param.cancelAndHoldAtTime) param.cancelAndHoldAtTime(now);
    else { const value = param.value; param.cancelScheduledValues(now); param.setValueAtTime(value, now); }
  }

  cancelPending() {
    if (!this.pending) return;
    this.sequence++;
    this.release(this.pending); this.pending = null;
  }

  fail(error) {
    if (this.disposed || !this.enabled) return;
    this.setEnabled(false);
    this.onError?.(error.message || '音频播放失败，请重新开启环境音。');
  }

  release(deck) {
    if (!deck || deck.released) return;
    deck.released = true;
    clearTimeout(deck.timeout); clearTimeout(deck.cleanup);
    deck.cancel?.();
    deck.media.onerror = null;
    deck.media.pause(); deck.media.removeAttribute('src'); deck.media.load();
    deck.source.disconnect(); deck.level.disconnect(); deck.fade.disconnect();
  }

  dispose() {
    this.setEnabled(false); this.disposed = true;
    clearTimeout(this.pauseTimer);
    this.release(this.active); this.release(this.retiring);
    this.active = null; this.retiring = null;
    this.context?.close();
  }
}
