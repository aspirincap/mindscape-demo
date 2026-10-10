import { EEGSequence, EEG_FRESH_MS } from './eeg-protocol.mjs';
const clamp = (v, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
export const median = values => { const a = [...values].sort((a, b) => a - b); return a.length ? (a[Math.floor((a.length - 1) / 2)] + a[Math.ceil((a.length - 1) / 2)]) / 2 : 0; };
const fields = ['attention', 'relaxation'];
export class EEGFeedback {
  constructor() { this.reset(); }
  reset() {
    this.sequence = new EEGSequence(); this.streamId = null; this.observations = {}; this.lastValid = {}; this.windows = { attention: [], relaxation: [] }; this.streak = { attention: 0, relaxation: 0 };
    this.controls = { attention: .5, relaxation: .5 }; this.targets = { ...this.controls }; this.baseline = null; this.calibration = { state: 'idle', elapsed: 0, samples: { attention: [], relaxation: [] } };
    this.history = { attention: [], relaxation: [] }; this.lastNow = null; this.arrived = null; this.autoPaused = false; this.mix = 0; this.flags = { paused: false, hidden: false, connected: false, enabled: false }; this.validity = {};
    this.value = this.view(0);
  }
  beginCalibration() {
    if (!fields.every(k => this.validity[k] && this.streak[k] >= 3)) return false;
    this.calibration = { state: 'collecting', elapsed: 0, samples: { attention: [], relaxation: [] } }; return true;
  }
  resume() { this.autoPaused = false; }
  ingest(message, now, transportAge = 0) {
    if (!Number.isFinite(transportAge) || transportAge >= EEG_FRESH_MS) return false;
    let data;
    try { data = this.sequence.accept({ ...message, type: 'sensor' }, now, transportAge); } catch { return false; }
    if (this.streamId !== data.streamId) {
      this.streamId = data.streamId; this.baseline = null; this.observations = {}; this.lastValid = {}; this.windows = { attention: [], relaxation: [] }; this.streak = { attention: 0, relaxation: 0 };
      this.calibration = { state: 'idle', elapsed: 0, samples: { attention: [], relaxation: [] } }; this.history = { attention: [], relaxation: [] }; this.lastMapped = null;
    }
    this.arrived = now;
    const f = data.frame;
    for (const key of ['attention', 'relaxation', 'HR', 'poorSignal']) {
      const id = f.sampleIds[key], old = this.observations[key];
      const at = f.ageMs[key] === null ? -Infinity : now - f.ageMs[key];
      this.observations[key] = { id, value: f[key], at, valid: key === 'poorSignal' ? f.poorSignal === 0 && f.ageMs.poorSignal < EEG_FRESH_MS : f.valid[key] };
      if (!fields.includes(key)) continue;
      const isValid = f.valid[key];
      if (!isValid || (old && now - old.at >= EEG_FRESH_MS)) { this.streak[key] = 0; this.windows[key] = []; }
      if (id === null || old?.id === id) continue;
      this.history[key].push({ at: now, capturedAt: data.capturedAt - (f.ageMs[key] || 0), sampleId: id, value: isValid ? f[key] : null });
      this.history[key] = this.history[key].slice(-120);
      if (!isValid) continue;
      this.lastValid[key] = at;
      this.streak[key]++;
      if (this.flags.paused || this.flags.hidden) continue;
      this.windows[key] = [...this.windows[key].slice(-2), f[key]];
      const m = median(this.windows[key]), b = this.baseline?.[key];
      const mapped = b ? .5 + .35 * Math.tanh((Math.abs(m - b.median) <= .03 ? 0 : m - b.median) / b.scale) : .35 + m * .3;
      if (Math.abs(m - (this.lastMapped?.[key] ?? -1)) >= .03 || !this.lastMapped) {
        this.targets[key] = clamp(mapped, .15, .85); this.lastMapped = { ...this.lastMapped, [key]: m };
      }
      if (this.calibration.state === 'collecting') this.calibration.samples[key].push(f[key]);
    }
    return true;
  }
  tick(now, flags = {}) {
    const previousFlags = this.flags; this.flags = { ...this.flags, ...flags };
    const dt = this.lastNow === null || previousFlags.paused || previousFlags.hidden ? 0 : Math.max(0, (now - this.lastNow) / 1000); this.lastNow = now;
    const active = !this.flags.paused && !this.flags.hidden;
    for (const key of fields) {
      const o = this.observations[key], q = this.observations.poorSignal;
      const valid = !!(this.flags.connected && o?.valid && now - o.at < EEG_FRESH_MS && q?.valid && now - q.at < EEG_FRESH_MS);
      if (!valid && this.validity[key]) {
        this.streak[key] = 0; this.windows[key] = [];
        this.history[key].push({ at: now, value: null, gap: true }); this.history[key] = this.history[key].slice(-120);
      }
      this.validity[key] = valid;
      if (active && valid && this.streak[key] >= 3 && !this.autoPaused) {
        const delta = (this.targets[key] - this.controls[key]) * (1 - Math.exp(-dt / 3));
        this.controls[key] += clamp(delta, -.1 * dt, .1 * dt);
      }
    }
    const hr = this.observations.HR;
    this.validity.HR = !!(this.flags.connected && hr?.valid && now - hr.at < EEG_FRESH_MS);
    if (this.arrived !== null && now - this.arrived > 10000) this.autoPaused = true;
    if (this.calibration.state === 'collecting' && active && !previousFlags.paused && !previousFlags.hidden) {
      this.calibration.elapsed += dt;
      if (this.calibration.elapsed >= 30 && fields.every(k => this.calibration.samples[k].length >= 25 && this.validity[k] && this.streak[k] >= 3)) {
        this.baseline = Object.fromEntries(fields.map(k => { const values = this.calibration.samples[k], mid = median(values); return [k, { median: mid, scale: Math.max(.12, median(values.map(v => Math.abs(v - mid))) * 3) }]; }));
        this.lastMapped = null; this.calibration.state = 'complete';
      } else if (this.calibration.elapsed >= 60) this.calibration.state = 'failed';
    }
    // Disabling returns smoothly to the manual preset; outages hold the current mix.
    if (active) {
      const target = !this.flags.enabled ? 0 : fields.some(k => this.validity[k] && this.streak[k] >= 3) && !this.autoPaused ? 1 : this.mix;
      this.mix += (target - this.mix) * (1 - Math.exp(-dt / 3));
    }
    this.value = this.view(now); return this.value;
  }
  view(now) {
    let status = '等待设备';
    if (this.arrived !== null) {
      if (!this.flags.connected) status = '断连 · 已保持氛围';
      else if (this.autoPaused) status = '联动已暂停 · 请重新开始';
      else if (this.flags.paused || this.flags.hidden) status = '用户暂停';
      else if (this.observations.poorSignal?.value > 0) status = '接触待调整 · 已保持氛围';
      else if (fields.some(k => now - (this.observations[k]?.at ?? -Infinity) >= EEG_FRESH_MS)) status = '数据过期 · 已保持氛围';
      else if (fields.some(k => !this.validity[k])) status = '指标无效 · 已保持氛围';
      else if (fields.some(k => this.streak[k] < 3)) status = '等待稳定 · 需 3 个新读数';
      else if (this.calibration.state === 'collecting') status = '校准中';
      else status = this.flags.enabled ? '脑电联动' : this.baseline ? '信号稳定 · 已校准' : '信号稳定 · 未校准';
    }
    const relaxation = this.controls.relaxation;
    return { source: 'device', attention: this.validity.attention ? this.observations.attention?.value ?? null : null,
      relaxation: this.validity.relaxation ? this.observations.relaxation?.value ?? null : null, HR: this.validity.HR ? this.observations.HR.value : null,
      signalQuality: fields.every(k => this.validity[k]) ? 1 : 0, poorSignal: this.observations.poorSignal?.value ?? null,
      coherence: .76, tension: .24, relaxationControl: relaxation, attentionControl: this.controls.attention,
      feedbackEnabled: this.flags.enabled && !this.autoPaused, feedbackMix: this.mix, validity: { ...this.validity }, status,
      lastValidAgeMs: Object.fromEntries(fields.map(k => [k, this.lastValid[k] !== undefined ? Math.max(0, now - this.lastValid[k]) : null])),
      calibration: { state: this.calibration.state, elapsed: this.calibration.elapsed, counts: Object.fromEntries(fields.map(k => [k, this.calibration.samples[k].length])) }, baseline: this.baseline };
  }
}

// Same bounded offsets for both renderers; the user's settings are never mutated.
export function feedbackVisual(base, state, geographic = false, reduced = false) {
  if (state?.source !== 'device' || base.mode === 'original') return { ...base, eegMix: 0, accentGain: 1, geoLocked: state?.source === 'device' };
  const mix = reduced ? 0 : clamp(state.feedbackMix || 0), r = state.relaxationControl ?? .5, a = state.attentionControl ?? .5;
  return { ...base, eegMix: mix, geoLocked: true, brightness: clamp(base.brightness * (1 + mix * (a - .5) * .3), .5, 2),
    dispersion: geographic ? base.dispersion : clamp(base.dispersion + mix * (1 - r) * .16),
    flow: geographic ? base.flow : clamp(base.flow * (1 + mix * (r - .5) * .4), 0, 2),
    speed: geographic ? base.speed : clamp(base.speed * (1 + mix * (r - .5) * .25), 0, 1.5),
    bloom: clamp(base.bloom + mix * (r - .5) * .3, 0, 1.4), accentGain: 1 + mix * (r - .5) * .8,
    accentFlow: 1 + mix * (r - .5) * .5 };
}
