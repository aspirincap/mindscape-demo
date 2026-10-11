import { sample } from './eeg-fixture.mjs';
import { EEG_PROTOCOL } from '../src/core/eeg-protocol.mjs';
import { LOCATIONS } from '../src/core/locations.mjs';
import { SCENE_ASSETS } from '../src/core/scene-assets.mjs';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { WebSocket } from 'ws';
import { writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';

let mf, base = process.env.DEPLOY_URL;
let wsAgent;
if (base && process.env.TEST_HTTPS_PROXY) {
  const { ProxyAgent, setGlobalDispatcher } = await import('undici');
  const { HttpsProxyAgent } = await import('https-proxy-agent');
  setGlobalDispatcher(new ProxyAgent(process.env.TEST_HTTPS_PROXY));
  wsAgent = new HttpsProxyAgent(process.env.TEST_HTTPS_PROXY);
}
if (!base) {
  const { build } = await import('esbuild');
  const { Miniflare, convertV4MiniflareOptions } = await import('miniflare');
  const bundle = await build({ entryPoints: ['worker/index.mjs'], bundle: true, write: false, format: 'esm', platform: 'browser', external: ['cloudflare:workers'] });
  mf = new Miniflare(convertV4MiniflareOptions({ name: 'mindscape-test', modules: true, script: bundle.outputFiles[0].text, compatibilityDate: '2026-10-01',
    bindings: { AI_GATEWAY_ID: 'mindscape-demo', AI_MODEL: 'test', AI_DAILY_LIMIT: '200' },
    durableObjects: { SESSIONS: { className: 'SensorSession', useSQLite: true }, AI_BUDGET: { className: 'AiBudget', useSQLite: true } },
    serviceBindings: { ASSETS: () => new Response('Mindscape test assets') },
  }));
  base = String(await mf.ready).replace(/\/$/, '');
}
const sockets = [], checks = [];
const record = name => { checks.push(name); console.log(`PASS ${name}`); };
const frame = { attention: .61, relaxation: .87, HR: 68, signalQuality: .98 };
async function session() {
  const r = await fetch(`${base}/api/session`); const data = await r.json();
  assert.equal(data.backend, 'cloudflare');
  assert.match(r.headers.get('Set-Cookie'), /HttpOnly; SameSite=Strict/);
  if (base.startsWith('https')) assert.match(r.headers.get('Set-Cookie'), /Secure/);
  return { token: data.token, headers: { Cookie: r.headers.get('Set-Cookie').split(';')[0], 'Content-Type': 'application/json' } };
}
async function socket(headers, device = false) {
  const ws = new WebSocket(`${base.replace(/^http/, 'ws')}/ws${device ? '?role=device' : ''}`, { headers, agent: wsAgent }); sockets.push(ws);
  const messages = []; ws.on('message', raw => messages.push(JSON.parse(raw)));
  await once(ws, 'open'); return { ws, messages };
}
const waitFor = async predicate => { for (let i=0;i<60;i++) { if (predicate()) return; await new Promise(r=>setTimeout(r,100)); } throw new Error('Timed out'); };
try {
  const a = await session(), b = await session(); assert.notEqual(a.token, b.token);
  assert.equal((await fetch(`${base}/api/frame`, { method: 'POST', body: '{}' })).status, 401);
  assert.equal((await fetch(`${base}/api/session`, { headers: { Origin: 'https://unrelated.example' } })).status, 403);
  record('independent secure sessions, unauthenticated input and cross-origin rejection');
  const sa = await socket(a.headers), sb = await socket(b.headers);
  const device = await socket({ Authorization: `Bearer ${a.token}` }, true);
  device.ws.send(JSON.stringify({ type: 'ping', protocol: EEG_PROTOCOL, id: 1 }));
  await waitFor(() => device.messages.some(m => m.lease));
  const lease = device.messages.find(m => m.lease).lease;
  device.ws.send(JSON.stringify({ ...sample(), lease }));
  await waitFor(() => sa.messages.some(m => m.type === 'eeg-frame'));
  await new Promise(r => setTimeout(r, 300));
  assert.equal(sb.messages.some(m => m.type === 'eeg-frame'), false);
  const health = await (await fetch(`${base}/api/health`, { headers: a.headers })).json();
  assert.equal(health.sensorFresh, true); assert.equal(health.gateway, 'mindscape-demo');
  assert.equal(health.worlds.length,22);
  record('WebSocket sensor transport with strict visitor isolation');
  const auth = { Authorization: `Bearer ${a.token}`, 'Content-Type': 'application/json' };
  for (const input of [frame, { type: 'sensor', frame }, { ...sample(), protocol: 'mindscape.v1' }]) {
    const rejected = await fetch(`${base}/api/frame`, { method: 'POST', headers: auth, body: JSON.stringify(input) });
    assert.equal(rejected.status, 400);
  }
  const claim = await (await fetch(`${base}/api/eeg/lease`, { method: 'POST', headers: auth, body: JSON.stringify({ protocol: EEG_PROTOCOL }) })).json();
  const input = sample(2); input.frame.HR = 66; input.frame.ageMs.HR = 0; input.frame.sampleIds.HR = 2; input.capabilities.heartRate = true;
  const posted = await fetch(`${base}/api/frame`, { method: 'POST', headers: auth, body: JSON.stringify({ ...input, ...claim }) });
  assert.equal(posted.status, 200); await waitFor(() => sa.messages.some(m => m.frame?.HR === 66));
  const duplicate = await fetch(`${base}/api/frame`, { method: 'POST', headers: auth, body: JSON.stringify({ ...input, ...claim }) });
  assert.equal(duplicate.status, 409);
  record('paired external device HTTP input and invalid sensor rejection');
  await new Promise(r => setTimeout(r, 2600));
  assert.equal((await (await fetch(`${base}/api/health`, { headers: a.headers })).json()).sensorFresh, false);
  record('stale signal detected after 2.5 seconds');
  assert.equal((await fetch(`${base}/api/route`, { method: 'POST', headers: a.headers, body: '{"text":""}' })).status, 400);
  assert.equal((await fetch(`${base}/api/route`, { method: 'POST', headers: a.headers, body: 'a'.repeat(17000) })).status, 400);
  const r = await fetch(`${base}/api/route`, { method: 'POST', headers: a.headers, body: JSON.stringify({ text: '想去科尔科瓦多雨林，听一听树叶的声音。' }) });
  assert.equal(r.status, 200); const route = await r.json();
  assert.equal(route.world, 'scene-02'); assert.equal(route.recommendedWorlds.length, 22);
  if (process.env.REQUIRE_AI === '1') { assert.equal(route.mode, 'ai-gateway'); assert.equal(route.gateway, 'mindscape-demo'); }
  else assert.ok(['ai-gateway', 'local-rules'].includes(route.mode));
  if (process.env.EXPECTED_AI_MODEL) { assert.equal(route.mode, 'ai-gateway'); assert.equal(route.model, process.env.EXPECTED_AI_MODEL); assert.equal(health.model, process.env.EXPECTED_AI_MODEL); }
  record(`recommendation contract: ${route.mode}${route.fallback ? ' / ' + route.fallback : ''}`);
  if (mf) {
    let limited;
    for (let i = 0; i < 6; i++) limited = await (await fetch(`${base}/api/route`, { method: 'POST', headers: a.headers, body: '{"text":"森林"}' })).json();
    assert.equal(limited.fallback, 'rate-limited');
    record('AI request budget persists across requests');
  } else {
    for (const path of ['/', '/globe/land-points.bin', '/fonts/InterVariable.woff2', '/terrain/fuji/manifest.json', '/terrain/grand-canyon/manifest.json']) {
      const asset = await fetch(base + path); assert.equal(asset.status, 200); await asset.arrayBuffer();
    }
    for (const asset of SCENE_ASSETS) {
      const r = await fetch(base + asset.url, { method: 'HEAD' });
      assert.equal(r.status, 200); assert.equal(Number(r.headers.get('content-length')), asset.bytes);
      assert.equal(r.headers.get('etag'), `"${asset.sha256}"`);
      assert.match(r.headers.get('content-type'), /octet-stream/);
    }
    const first = await fetch(base + SCENE_ASSETS[0].url);
    assert.equal(createHash('sha256').update(Buffer.from(await first.arrayBuffer())).digest('hex'), SCENE_ASSETS[0].sha256);
    for (const path of ['/scene-data/missing.bin', '/scene-data/scene-01/wrong.bin', '/worlds/forest.bin']) assert.equal((await fetch(base + path)).status, 404);
    const catalog = await (await fetch(base + '/api/locations')).json();
    assert.deepEqual(catalog.locations.map(l=>l.worldId), LOCATIONS.map(l=>l.worldId));
    record('live homepage, 2 geographic manifests, all 20 R2 sizes/ETags, binary checksum and obsolete asset rejection');
    const model = await fetch(base + '/mediapipe/gesture-recognizer-v1.task');
    assert.equal(model.status, 200);
    assert.equal(createHash('sha256').update(Buffer.from(await model.arrayBuffer())).digest('hex'), '97952348cf6a6a4915c2ea1496b4b37ebabc50cbbf80571435643c455f2b0482');
    const wasm = await fetch(base + '/mediapipe/1.1.0/vision_wasm_internal.wasm');
    assert.equal(wasm.status, 200); assert.match(wasm.headers.get('content-type'), /wasm/); await wasm.arrayBuffer();
    const worker = await fetch(base + '/mediapipe/gesture-worker-v1.js');
    assert.equal(worker.status, 200); const workerCode=await worker.text();assert.match(workerCode, /recognizeForVideo/);assert.match(workerCode, /numHands: 1/);
    assert.match(worker.headers.get('cache-control'), /no-cache/);
    record('same-origin single-hand model checksum, WASM MIME and worker cache policy');
    const named=await (await fetch(`${base}/api/route`,{method:'POST',headers:a.headers,body:JSON.stringify({text:'我想去特罗姆瑟看极光。'})})).json();assert.equal(named.world,'scene-19');assert.equal(named.recommendedWorlds.length,22);if(process.env.REQUIRE_AI==='1')assert.equal(named.mode,'ai-gateway');record(`new landmark recommendation: ${named.mode} / ${named.world}`);
  }
  await mkdir('artifacts', { recursive: true });
  await writeFile(`artifacts/cloudflare-${mf ? 'local' : 'live'}.json`, JSON.stringify({ base, checks, ai: { mode: route.mode, model: route.model, gateway: route.gateway, requestId: route.gatewayRequestId, fallback: route.fallback }, at: new Date().toISOString() }, null, 2));
} finally { for (const ws of sockets) ws.close(); await mf?.dispose(); }
