import { LOCATIONS, locationForWorld } from './locations.mjs';
export const DEFAULT_FRAME = Object.freeze({ attention: 0.58, relaxation: 0.76, HR: 72, signalQuality: 0.98 });
export const clamp = (n, a = 0, b = 1) => Math.min(b, Math.max(a, n));

// Simulator-only processor. Device samples use EEGFeedback and never enter here.
export class SignalProcessor {
  constructor() { this.value = { ...DEFAULT_FRAME, source: 'simulator', coherence: .76, tension: .24 }; }
  update(frame, dt) {
    this.value.signalQuality = frame.signalQuality;
    if (frame.signalQuality < .4) return this.value;
    const alpha = 1 - Math.exp(-Math.max(0, dt) / 1.15);
    for (const key of ['attention', 'relaxation', 'HR']) this.value[key] += (frame[key] - this.value[key]) * alpha;
    this.value.coherence = this.value.relaxation; this.value.tension = 1 - this.value.coherence;
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
    const named = [location.name, location.english, location.title].some(word => words.includes(word.toLowerCase()));
    const explicit = location.aliases.split(' ').filter(word => word.length > 1).some(word => words.includes(word.toLowerCase()));
    const themes = location.theme.filter(word => words.includes(word)).length;
    const defaultWorld = frame.relaxation < .5 ? 'scene-01' : 'scene-02';
    return { worldId: location.worldId, locationId: location.id, score: named ? 98 : explicit ? 96 : themes ? 88 + Math.min(5, themes) : location.worldId === defaultWorld ? 82 : 70 - index, reason: location.description };
  }).sort((a,b) => b.score-a.score);
  const first = ranked[0];
  return { world: first.worldId, mode: 'local-rules', theme: locationForWorld(first.worldId).theme[0], reason: first.reason, recommendedWorlds: ranked };
}
