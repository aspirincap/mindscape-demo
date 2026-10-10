// One wire protocol for HTTP and WebSocket. No rendering or personal baseline here.
export const EEG_PROTOCOL = 'mindscape.eeg.v2';
export const EEG_FRESH_MS = 2500;
export const EEG_FIELDS = ['attention', 'relaxation', 'poorSignal', 'HR'];
export class EEGError extends Error {
  constructor(message, code = 'INVALID_EEG', status = 400) { super(message); this.code = code; this.status = status; }
}
const object = v => v && typeof v === 'object' && !Array.isArray(v);
const finite = (v, min, max) => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
export function validateEEG(data, extraAge = 0) {
  if (data?.protocol !== EEG_PROTOCOL) throw new EEGError(`协议不匹配，请更新采集客户端至 ${EEG_PROTOCOL}`, 'PROTOCOL_MISMATCH');
  if (data.type !== 'sensor' || !/^[a-f0-9-]{36}$/i.test(data.streamId || '') || !Number.isSafeInteger(data.seq) || data.seq < 1 || !finite(data.capturedAt, 1, Number.MAX_SAFE_INTEGER) || data.source !== 'thinkgear') throw new EEGError('无效的采集流或序号');
  const f = data.frame;
  if (!object(f) || !object(f.ageMs) || !object(f.sampleIds) || !object(data.capabilities) || !finite(extraAge, 0, 60000)) throw new EEGError('缺少字段时效或设备能力');
  const ageMs = {}, sampleIds = {}, valid = {};
  const frame = {};
  for (const key of EEG_FIELDS) {
    const value = f[key] ?? null, age = f.ageMs[key] ?? null, id = f.sampleIds[key] ?? null;
    if (value !== null && typeof value !== 'number') throw new EEGError(`无效 ${key} 数值`);
    if (value !== null && !Number.isFinite(value)) throw new EEGError(`无效 ${key} 数值`);
    if (age !== null && !finite(age, 0, Number.MAX_SAFE_INTEGER)) throw new EEGError('无效字段年龄');
    if (id !== null && (!Number.isSafeInteger(id) || id < 1 || id > data.seq)) throw new EEGError('无效独立样本序号');
    if (value !== null && (id === null || age === null)) throw new EEGError('读数缺少独立样本或字段年龄');
    ageMs[key] = age === null ? null : age + extraAge; sampleIds[key] = id;
    const range = key === 'poorSignal' ? [0, 255] : key === 'HR' ? [35, 220] : [.01, 1];
    frame[key] = finite(value, ...range) && (key !== 'poorSignal' || Number.isInteger(value)) ? value : null;
  }
  const contact = frame.poorSignal === 0 && ageMs.poorSignal !== null && ageMs.poorSignal < EEG_FRESH_MS;
  for (const key of ['attention', 'relaxation', 'HR']) {
    valid[key] = frame[key] !== null && ageMs[key] !== null && ageMs[key] < EEG_FRESH_MS && (key === 'HR' ? data.capabilities.heartRate === true : contact);
    if (key === 'HR' && !data.capabilities.heartRate) frame.HR = null;
  }
  return { type: 'sensor', protocol: EEG_PROTOCOL, streamId: data.streamId, seq: data.seq, capturedAt: data.capturedAt, source: 'thinkgear',
    frame: { ...frame, valid, ageMs, sampleIds, signalQuality: contact && (valid.attention || valid.relaxation) ? 1 : 0 },
    capabilities: { heartRate: data.capabilities.heartRate === true, raw: data.capabilities.raw === true } };
}

// At the receiver, unchanged sample IDs retain their original deadline even if a
// sender retransmits them with age=0. No payload snapshots are replayed on connect.
export class EEGSequence {
  constructor() { this.streamId = null; this.seq = 0; this.fields = {}; this.retired = new Set(); }
  accept(data, now, transportBound = 0) {
    const out = validateEEG(data, transportBound);
    if (this.streamId !== out.streamId) {
      if (this.retired.has(out.streamId)) throw new EEGError('已结束的采集流', 'OLD_STREAM', 409);
      if (this.streamId) this.retired.add(this.streamId);
      if (this.retired.size > 128) throw new EEGError('采集流过多，请重新配对', 'REPAIR_REQUIRED', 409);
      this.streamId = out.streamId; this.seq = 0; this.fields = {};
    }
    if (out.seq <= this.seq) throw new EEGError('重复或乱序设备包', 'OLD_SAMPLE', 409);
    const fields = { ...this.fields };
    for (const key of EEG_FIELDS) {
      const id = out.frame.sampleIds[key], age = out.frame.ageMs[key], previous = fields[key];
      if (previous && (id === null || id < previous.id)) throw new EEGError('字段样本倒退', 'OLD_SAMPLE', 409);
      if (id !== null) {
        const at = age === null ? -Infinity : now - age;
        if (previous?.id === id) {
          if (out.frame[key] !== previous.value) throw new EEGError('相同样本的值发生变化', 'OLD_SAMPLE', 409);
          out.frame.ageMs[key] = Math.max(age ?? Infinity, now - previous.at);
        } else fields[key] = { id, at, value: out.frame[key] };
      }
    }
    const normalized = validateEEG(out);
    this.fields = fields; this.seq = out.seq;
    return normalized;
  }
}

// Server timestamp mapped to a conservative local lower bound using a ping round
// trip. It works even when the Mac clock is hours away from the server clock.
export class EEGClock {
  reset() { this.offset = null; this.syncedAt = -Infinity; }
  constructor() { this.reset(); }
  sync(sentMono, arrivedMono, serverTime) {
    if (!finite(arrivedMono - sentMono, 0, EEG_FRESH_MS) || !Number.isFinite(serverTime)) return false;
    this.offset = sentMono - serverTime; this.syncedAt = arrivedMono; return true;
  }
  age(receivedAt, now) {
    return this.offset === null || now - this.syncedAt > 5000 ? Infinity : Math.max(0, now - (receivedAt + this.offset));
  }
}
