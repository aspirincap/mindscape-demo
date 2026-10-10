// Opt-in, local-only diagnostic. Subscribes to an existing monitor; never opens
// the serial port again and never writes raw packets / credentials to disk.
import { WebSocket } from 'ws';
import { writeFile, mkdir } from 'node:fs/promises';
import { EEGObservations } from '../server/eeg-observations.mjs';
import { EEGForwarder } from '../server/eeg-forwarder.mjs';
import { EEGFeedback } from '../src/core/eeg-feedback.mjs';
import { EEGClock, EEG_PROTOCOL } from '../src/core/eeg-protocol.mjs';
const base = process.env.EEG_TARGET || 'http://127.0.0.1:5186', monitor = 'http://127.0.0.1:8765';
if (!/^http:\/\/(127\.0\.0\.1|localhost):(5173|5174|5186)$/.test(base)) throw new Error('Live diagnostic only accepts local targets');
const duration = Number(process.env.EEG_TEST_SECONDS || 600), start = performance.now();
const session = await (await fetch(base + '/api/session')).json();
const o = new EEGObservations(), f = new EEGForwarder(o), feedback = new EEGFeedback(), clock = new EEGClock();
const summary = { startedAt: new Date().toISOString(), duration, source: 'existing serial monitor SSE (no second serial reader)', frames: 0, valid: { attention: 0, relaxation: 0 }, maxFieldAgeMs: 0, maxTransportBoundMs: 0, rttMaxMs: 0, memoryRSS: [], calibration: 'not-started' };
const ws = new WebSocket(base.replace(/^http/, 'ws') + '/ws', { headers: { Cookie: `mindscape_session=${session.token}` } });
let ping = 0; const pending = new Map();
ws.on('open', () => { f.serialState('connected'); f.start({ protocol: EEG_PROTOCOL, http: base + '/api/frame', websocket: base.replace(/^http/, 'ws') + '/ws?role=device', authorization: `Bearer ${session.token}`, expiresAt: session.expiresAt }); });
ws.on('message', raw => {
  const d = JSON.parse(raw), now = performance.now();
  if (d.type === 'pong' && pending.has(d.id)) { const sent = pending.get(d.id); summary.rttMaxMs = Math.max(summary.rttMaxMs, now - sent); clock.sync(sent, now, d.serverTime); pending.delete(d.id); }
  if (d.type !== 'eeg-frame') return;
  summary.frames++; const age = clock.age(d.receivedAt, now); if (Number.isFinite(age)) summary.maxTransportBoundMs = Math.max(summary.maxTransportBoundMs, age);
  feedback.tick(now, { connected: true, enabled: true }); feedback.ingest(d, now, age); feedback.tick(now);
  for (const k of ['attention', 'relaxation']) { if (feedback.value.validity[k]) summary.valid[k]++; summary.maxFieldAgeMs = Math.max(summary.maxFieldAgeMs, d.frame.ageMs[k] || 0); }
  if (feedback.calibration.state === 'idle') feedback.beginCalibration();
});
const timer = setInterval(() => { const now = performance.now(); if (ws.readyState === WebSocket.OPEN) { pending.set(++ping, now); ws.send(JSON.stringify({ type: 'ping', protocol: EEG_PROTOCOL, id: ping })); } for (const [id, at] of pending) if (now - at > 5000) pending.delete(id); feedback.tick(now, { connected: ws.readyState === WebSocket.OPEN, enabled: true }); }, 1000);
const memory = setInterval(() => summary.memoryRSS.push(process.memoryUsage().rss), 30000);
const abort = new AbortController(), end = setTimeout(() => abort.abort(), duration * 1000);
try {
  const response = await fetch(monitor + '/api/eeg/events', { signal: abort.signal });
  let buffer = '';
  for await (const bytes of response.body) {
    buffer += new TextDecoder().decode(bytes, { stream: true });
    let idx;
    while ((idx = buffer.indexOf('\n\n')) >= 0) {
      const block = buffer.slice(0, idx); buffer = buffer.slice(idx + 2); const type = block.match(/^event: (.+)$/m)?.[1], text = block.match(/^data: (.+)$/m)?.[1]; if (!text) continue;
      const d = JSON.parse(text);
      if (type === 'status') f.serialState(d.state);
      if (type !== 'update') continue; // Snapshot replay never becomes new samples.
      for (const event of d.events) for (const packet of event.packets) if (o.observe(packet, event.timestamp, performance.now() - Math.max(0, Date.now() - event.timestamp))) f.flush();
    }
  }
} catch (e) { if (e.name !== 'AbortError') summary.error = e.message; }
finally {
  clearInterval(timer); clearInterval(memory); clearTimeout(end); f.stop(); ws.terminate();
  summary.elapsedSeconds = (performance.now() - start) / 1000; summary.reconnects = f.state.reconnects; summary.sent = f.state.sent; summary.calibration = feedback.calibration.state;
  summary.calibrationCounts = feedback.value.calibration?.counts;
  summary.validRatio = Object.fromEntries(Object.entries(summary.valid).map(([k, n]) => [k, summary.frames ? n / summary.frames : 0]));
  await mkdir('artifacts/eeg', { recursive: true }); await writeFile('artifacts/eeg/live-summary.json', JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary));
}
