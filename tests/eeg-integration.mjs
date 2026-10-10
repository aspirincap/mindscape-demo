import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { WebSocket } from 'ws';
import { EEG_PROTOCOL } from '../src/core/eeg-protocol.mjs';
import { EEGObservations } from '../server/eeg-observations.mjs';
import { EEGForwarder } from '../server/eeg-forwarder.mjs';
const port = 5178, base = `http://127.0.0.1:${port}`, sockets = [];
const child = spawn(process.execPath, ['server/index.mjs'], { env: { ...process.env, NODE_ENV: 'production', PORT: String(port) }, stdio: ['ignore', 'pipe', 'pipe'] });
let startup = ''; child.stdout.on('data', d => startup += d); child.stderr.on('data', d => process.stderr.write(d));
const wait = ms => new Promise(r => setTimeout(r, ms));
async function until(fn, timeout = 7000) { const end = Date.now() + timeout; while (Date.now() < end) { if (fn()) return; await wait(50); } throw new Error('Timed out'); }
async function viewer(s) { const ws = new WebSocket(base.replace('http:', 'ws:') + '/ws', { headers: { Cookie: `mindscape_session=${s.token}` } }); const messages = []; sockets.push(ws); ws.on('message', d => messages.push(JSON.parse(d))); await once(ws, 'open'); return { ws, messages }; }
const o = new EEGObservations(), forward = new EEGForwarder(o);
try {
  await until(() => startup.includes('ready'));
  const a = await (await fetch(base + '/api/session')).json(), b = await (await fetch(base + '/api/session')).json();
  const va = await viewer(a), vb = await viewer(b);
  const config = { protocol: EEG_PROTOCOL, http: base + '/api/frame', websocket: base.replace('http:', 'ws:') + '/ws?role=device', authorization: `Bearer ${a.token}`, expiresAt: a.expiresAt };
  forward.serialState('connected'); forward.start(config); await until(() => forward.state.state === 'connected');
  o.observe({ checksumValid: true, values: { attention: 70, meditation: 23, poorSignal: 0 } }, Date.now()); forward.flush();
  await until(() => va.messages.some(m => m.type === 'eeg-frame'));
  const frames = () => va.messages.filter(m => m.type === 'eeg-frame');
  assert.equal(frames()[0].frame.HR, null); assert.equal(frames()[0].frame.valid.relaxation, true); assert.equal(vb.messages.some(m => m.type === 'eeg-frame'), false);
  await wait(1100); o.observe({ checksumValid: true, values: { attention: 70 } }, Date.now()); forward.flush(); await until(() => frames().length === 2);
  assert.equal(frames()[1].frame.sampleIds.relaxation, 1); assert.ok(frames()[1].frame.ageMs.relaxation >= 1000);
  await wait(2700); assert.equal(frames().length, 2, 'heartbeats are not samples');
  assert.equal((await (await fetch(base + '/api/health', { headers: { Authorization: config.authorization } })).json()).sensorFresh, false);
  forward.socket.terminate(); await until(() => forward.state.reconnects > 0); await until(() => forward.state.state === 'connected'); await wait(300);
  assert.equal(frames().length, 2, 'reconnect does not replay expired readings');
  o.observe({ checksumValid: true, values: { attention: 74, meditation: 32, poorSignal: 0 } }, Date.now()); forward.flush(); await until(() => frames().length === 3);
  assert.equal(frames()[2].streamId, frames()[0].streamId);
  o.reset(); o.observe({ checksumValid: true, values: { attention: 74, meditation: 32, poorSignal: 0 } }, Date.now()); forward.flush(); await until(() => frames().length === 4); assert.notEqual(frames()[3].streamId, frames()[0].streamId);
  forward.stop(); assert.equal(forward.config, null); assert.equal(forward.state.state, 'stopped');
  assert.equal((await fetch(base + '/api/eeg/lease', { method: 'POST', headers: { Authorization: config.authorization, 'Content-Type': 'application/json', Origin: 'https://bad.example' }, body: JSON.stringify({ protocol: EEG_PROTOCOL }) })).status, 403);
  console.log('PASS real Node WS bridge, session isolation, per-field sample age, no heartbeat samples, reconnect without replay, stream reset and stop');
} finally { forward.stop(); for (const ws of sockets) ws.terminate(); child.kill('SIGTERM'); await once(child, 'exit'); }
