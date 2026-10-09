import { LOCATIONS } from '../src/core/locations.mjs';
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
async function socket(headers) {
  const ws = new WebSocket(`${base.replace(/^http/, 'ws')}/ws`, { headers, agent: wsAgent }); sockets.push(ws);
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
  sa.ws.send(JSON.stringify({ type: 'sensor', frame }));
  await waitFor(() => sa.messages.some(m => m.type === 'frame'));
  await new Promise(r => setTimeout(r, 300));
  assert.equal(sb.messages.some(m => m.type === 'frame'), false);
  const health = await (await fetch(`${base}/api/health`, { headers: a.headers })).json();
  assert.equal(health.sensorFresh, true); assert.equal(health.gateway, 'mindscape-demo');
  assert.equal(health.worlds.length,12);
  record('WebSocket sensor transport with strict visitor isolation');
  const posted = await fetch(`${base}/api/frame`, { method: 'POST', headers: { Authorization: `Bearer ${a.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ ...frame, HR: 66 }) });
  assert.equal(posted.status, 200); await waitFor(() => sa.messages.some(m => m.frame?.HR === 66));
  sa.ws.send(JSON.stringify({ type: 'sensor', frame: { ...frame, HR: 999 } }));
  await waitFor(() => sa.messages.some(m => m.type === 'error'));
  record('paired external device HTTP input and invalid sensor rejection');
  await new Promise(r => setTimeout(r, 2600));
  assert.equal((await (await fetch(`${base}/api/health`, { headers: a.headers })).json()).sensorFresh, false);
  record('stale signal detected after 2.5 seconds');
  assert.equal((await fetch(`${base}/api/route`, { method: 'POST', headers: a.headers, body: '{"text":""}' })).status, 400);
  assert.equal((await fetch(`${base}/api/route`, { method: 'POST', headers: a.headers, body: 'a'.repeat(17000) })).status, 400);
  const r = await fetch(`${base}/api/route`, { method: 'POST', headers: a.headers, body: JSON.stringify({ text: '想去雾中森林，听一听树叶的声音。', frame }) });
  assert.equal(r.status, 200); const route = await r.json();
  assert.equal(route.world, 'forest'); assert.equal(route.recommendedWorlds.length, 12);
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
    for (const path of ['/', '/globe/land-points.bin', '/fonts/InterVariable.woff2', ...LOCATIONS.map(l=>`/worlds/${l.worldId}.bin`)]) {
      const asset = await fetch(base + path); assert.equal(asset.status, 200); const bytes=await asset.arrayBuffer(); if(path.startsWith('/worlds/'))assert.equal(bytes.byteLength,LOCATIONS.find(l=>path===`/worlds/${l.worldId}.bin`).pointCount*32);
    }
    assert.equal((await fetch(base + '/worlds/missing.bin')).status, 404);
    record('live homepage, self-hosted font, globe and all 12 point-cloud assets');
    const model = await fetch(base + '/mediapipe/gesture-recognizer-v1.task');
    assert.equal(model.status, 200);
    assert.equal(createHash('sha256').update(Buffer.from(await model.arrayBuffer())).digest('hex'), '97952348cf6a6a4915c2ea1496b4b37ebabc50cbbf80571435643c455f2b0482');
    const wasm = await fetch(base + '/mediapipe/1.1.0/vision_wasm_internal.wasm');
    assert.equal(wasm.status, 200); assert.match(wasm.headers.get('content-type'), /wasm/); await wasm.arrayBuffer();
    const worker = await fetch(base + '/mediapipe/gesture-worker-v1.js');
    assert.equal(worker.status, 200); const workerCode=await worker.text();assert.match(workerCode, /recognizeForVideo/);assert.match(workerCode, /numHands: 1/);
    assert.match(worker.headers.get('cache-control'), /no-cache/);
    record('same-origin single-hand model checksum, WASM MIME and worker cache policy');
    const named=await (await fetch(`${base}/api/route`,{method:'POST',headers:a.headers,body:JSON.stringify({text:'我想去埃菲尔铁塔看看巴黎。',frame})})).json();assert.equal(named.world,'eiffel');assert.equal(named.recommendedWorlds.length,12);if(process.env.REQUIRE_AI==='1')assert.equal(named.mode,'ai-gateway');record(`new landmark recommendation: ${named.mode} / ${named.world}`);
  }
  await mkdir('artifacts', { recursive: true });
  await writeFile(`artifacts/cloudflare-${mf ? 'local' : 'live'}.json`, JSON.stringify({ base, checks, ai: { mode: route.mode, model: route.model, gateway: route.gateway, requestId: route.gatewayRequestId, fallback: route.fallback }, at: new Date().toISOString() }, null, 2));
} finally { for (const ws of sockets) ws.close(); await mf?.dispose(); }
