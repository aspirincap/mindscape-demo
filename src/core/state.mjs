import { LOCATIONS, locationForWorld } from './locations.mjs';
export const DEFAULT_FRAME = Object.freeze({ attention: 0.58, relaxation: 0.76, HR: 72, signalQuality: 0.98 });
export const clamp = (n, a = 0, b = 1) => Math.min(b, Math.max(a, n));

export function validateFrame(input) {
  if (!input || typeof input !== 'object') throw new Error('传感器帧必须是 JSON 对象');
  const ranges = { attention: [0, 1], relaxation: [0, 1], HR: [35, 220], signalQuality: [0, 1] };
  const result = {};
  for (const [key, [min, max]] of Object.entries(ranges)) {
    const value = input[key];
    if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
      throw new Error(`${key} 必须是 ${min}–${max} 之间的数值`);
    }
    result[key] = value;
  }
  return result;
}

export class SignalProcessor {
  constructor() {
    this.value = { ...DEFAULT_FRAME, coherence: 0.76, tension: 0.24 };
    this.baseline = null;
    this.samples = [];
    this.calibrating = false;
  }
  beginCalibration() { this.samples = []; this.calibrating = true; }
  finishCalibration() {
    if (this.samples.length >= 20) {
      this.baseline = this.samples.reduce((sum, n) => sum + n, 0) / this.samples.length;
    }
    this.calibrating = false;
    return this.samples.length >= 20;
  }
  update(frame, dt) {
    const alpha = 1 - Math.exp(-Math.min(dt, 0.1) / 1.15);
    this.value.signalQuality = frame.signalQuality;
    // Bad or stale input holds the last good visual state. It never means stress.
    if (frame.signalQuality < 0.4) return this.value;
    if (this.calibrating) this.samples.push(frame.relaxation);
    for (const key of ['attention', 'relaxation', 'HR']) {
      this.value[key] += (frame[key] - this.value[key]) * alpha;
    }
    const adjustment = this.baseline === null ? 0 : (0.5 - this.baseline) * 0.2;
    this.value.coherence = clamp(this.value.relaxation + adjustment);
    this.value.tension = 1 - this.value.coherence;
    return this.value;
  }
}

export function demoFrame(seconds) {
  const t = clamp(seconds / 60);
  // 0–12s fragmented, 12–45s recovery, 45–60s stillness.
  const recovery = clamp((t - 0.2) / 0.55);
  const ease = recovery * recovery * (3 - 2 * recovery);
  return { attention: 0.4 + ease * 0.38, relaxation: 0.14 + ease * 0.8,
    HR: 92 - ease * 28, signalQuality: 0.98 };
}

export function chooseWorld(text, frame = DEFAULT_FRAME) {
  const words = text.toLowerCase();
  const ranked = LOCATIONS.map((location, index) => {
    const explicit = [location.name, location.english, ...location.aliases.split(' ')].filter(word => word.length > 1).some(word => words.includes(word.toLowerCase()));
    const themes = location.theme.filter(word => words.includes(word)).length;
    const defaultWorld = frame.relaxation < .5 ? 'abyss' : 'forest';
    return { worldId: location.worldId, locationId: location.id, score: explicit ? 96 : themes ? 88 + Math.min(5, themes) : location.worldId === defaultWorld ? 82 : 70 - index, reason: location.description };
  }).sort((a,b) => b.score-a.score);
  const first = ranked[0];
  return { world: first.worldId, mode: 'local-rules', theme: locationForWorld(first.worldId).theme[0], reason: first.reason, recommendedWorlds: ranked };
}
