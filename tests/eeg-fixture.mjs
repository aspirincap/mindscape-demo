import { EEG_PROTOCOL } from '../src/core/eeg-protocol.mjs';
export const sample = (seq = 1, patch = {}) => ({ type: 'sensor', protocol: EEG_PROTOCOL, source: 'thinkgear', streamId: '00000000-0000-4000-a000-000000000001', seq, capturedAt: 1791638488926,
  frame: { attention: .7, relaxation: .23, HR: null, poorSignal: 0, ageMs: { attention: 0, relaxation: 0, poorSignal: 0 }, sampleIds: { attention: seq, relaxation: seq, poorSignal: seq } }, capabilities: { heartRate: false, raw: false }, ...patch });
