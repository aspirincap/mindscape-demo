import { randomUUID } from 'node:crypto';
import { EEG_PROTOCOL, validateEEG } from '../src/core/eeg-protocol.mjs';
export class EEGObservations {
  constructor() { this.reset(); }
  reset() { this.streamId = randomUUID(); this.seq = 0; this.values = {}; this.times = {}; this.ids = {}; this.capturedAt = null; this.raw = false; }
  observe(packet, capturedAt, mono = performance.now()) {
    if (!packet.checksumValid || packet.decodeError) return false;
    this.raw ||= !!(packet.raw16?.length || packet.raw8?.length);
    const entries = Object.entries(packet.values || {}).filter(([k]) => ['attention', 'meditation', 'poorSignal'].includes(k));
    if (!entries.length) return false;
    this.seq++; this.capturedAt = capturedAt;
    for (const [key, value] of entries) {
      const name = key === 'meditation' ? 'relaxation' : key;
      this.values[name] = name === 'poorSignal' ? value : value >= 1 && value <= 100 ? value / 100 : null;
      this.times[name] = mono; this.ids[name] = this.seq;
    }
    return true;
  }
  snapshot(mono = performance.now()) {
    if (!this.seq) return null;
    return validateEEG({ type: 'sensor', protocol: EEG_PROTOCOL, streamId: this.streamId, seq: this.seq, source: 'thinkgear', capturedAt: this.capturedAt,
      frame: { ...this.values, HR: null, ageMs: Object.fromEntries(Object.entries(this.times).map(([key, time]) => [key, Math.max(0, mono - time)])), sampleIds: { ...this.ids } },
      capabilities: { heartRate: false, raw: this.raw } });
  }
}
