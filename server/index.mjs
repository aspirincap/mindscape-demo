import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { EEG_PROTOCOL, EEGError } from '../src/core/eeg-protocol.mjs';
import { EEGSession } from '../worker/eeg-session.mjs';
import { COOKIE, SESSION_MS, validToken } from '../worker/common.mjs';
import { routeInput } from '../worker/recommend.mjs';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { parseTerrainTile } from '../src/core/terrain-format.mjs';
import { readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer, WebSocket } from 'ws';
import { chooseWorld } from '../src/core/state.mjs';
import { LOCATIONS } from '../src/core/locations.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const port = Number(process.env.PORT || 5173);
const prod = process.env.NODE_ENV === 'production';
let vite = null;
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.geojson': 'application/geo+json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.bin': 'application/octet-stream', '.ply': 'application/octet-stream', '.woff2': 'font/woff2', '.wasm': 'application/wasm', '.task': 'application/octet-stream' };
const sessions = new Map();
function tokenFor(req) {
  const token = req.headers.authorization?.match(/^Bearer (.+)$/)?.[1] || req.headers.cookie?.split(';').map(x => x.trim()).find(x => x.startsWith(COOKIE + '='))?.slice(COOKIE.length + 1);
  return validToken(token) ? token : null;
}
function relayFor(token) {
  if (!sessions.has(token)) sessions.set(token, new EEGSession());
  return sessions.get(token);
}
async function body(req) {
  let value = '';
  for await (const chunk of req) {
    value += chunk;
    if (value.length > 16384) throw new Error('请求内容过大');
  }
  return JSON.parse(value);
}
function json(res, status, data) { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(data)); }
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://127.0.0.1:${port}`);
    if (![`localhost:${port}`, `127.0.0.1:${port}`].includes(req.headers.host)) return json(res, 403, { error: 'Host rejected' });
    const token = tokenFor(req);
    // Loopback service; reject cross-origin mutation from other websites.
    if (req.headers.origin && ![`http://localhost:${port}`, `http://127.0.0.1:${port}`].includes(req.headers.origin)) return json(res, 403, { error: 'Origin rejected' });
    if (url.pathname.startsWith('/terrain-data/')) {
      const part=parseTerrainTile(url.pathname);
      if(!part)return json(res,404,{error:'Not found'});
      if(!['GET','HEAD'].includes(req.method)){res.writeHead(405,{Allow:'GET, HEAD'});return res.end();}
      const file=resolve(root,'artifacts/geospatial/published',part.key);
      let info;try{info=await stat(file);}catch{return json(res,404,{error:'Terrain pack not found; see GEOSPATIAL.md'});}
      if(part.offset+part.length>info.size)return json(res,416,{error:'Invalid tile range'});
      res.writeHead(200,{'Content-Type':'application/octet-stream','Content-Length':part.length,'Cache-Control':'public, max-age=31536000, immutable'});
      if(req.method==='HEAD')return res.end();
      const stream=createReadStream(file,{start:part.offset,end:part.offset+part.length-1});stream.on('error',()=>res.destroy());res.on('close',()=>stream.destroy());stream.pipe(res);return;
    }
    if (url.pathname === '/api/session' && req.method === 'GET') {
      const current = token || `${Date.now()}.${randomUUID().replaceAll('-', '')}${randomUUID().replaceAll('-', '')}`;
      res.setHeader('Set-Cookie', `${COOKIE}=${current}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${Math.max(0, Math.floor((Number(current.split('.')[0]) + SESSION_MS - Date.now()) / 1000))}`);
      return json(res, 200, { backend: 'local', router: 'local-rules', protocol: EEG_PROTOCOL, token: current, expiresAt: Number(current.split('.')[0]) + SESSION_MS });
    }
    if (url.pathname === '/api/health') return json(res, 200, { ok: true, worlds: LOCATIONS.map(l => l.worldId), ...(token ? relayFor(token).health() : { sensorFresh: false }), router: 'local-rules' });
    if (url.pathname === '/api/locations') return json(res, 200, { locations: LOCATIONS });
    if (['/api/frame', '/api/eeg/lease', '/api/route'].includes(url.pathname)) {
      if (!token) return json(res, 401, { error: '请先初始化会话或携带配对凭据' });
      if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });
      const data = await body(req);
      if (url.pathname === '/api/route') { const input = routeInput(data); return json(res, 200, chooseWorld(input.text)); }
      if (!req.headers.authorization) return json(res, 401, { error: '设备发送须携带 Authorization' });
      if (data.protocol !== EEG_PROTOCOL) throw new EEGError(`请更新客户端至 ${EEG_PROTOCOL}`, 'PROTOCOL_MISMATCH');
      const relay = relayFor(token);
      if (url.pathname === '/api/eeg/lease') return json(res, 200, relay.httpClaim());
      return json(res, 200, relay.receive(data.connectionId, data));
    }
    if (url.pathname.startsWith('/api/')) return json(res, 404, { error: 'Unknown API endpoint' });
    if (vite) return vite.middlewares(req, res);
    const dist = resolve(root, 'dist');
    const path = resolve(dist, '.' + decodeURIComponent(url.pathname));
    if (!path.startsWith(dist + sep) && path !== dist) return json(res, 403, { error: 'Forbidden' });
    const file = path === dist || url.pathname === '/' ? resolve(dist, 'index.html') : path;
    try { const content = await readFile(file); res.writeHead(200, { 'Content-Type': mime[extname(file)] || 'application/octet-stream' }); res.end(content); }
    catch { res.writeHead(404); res.end('Not found'); }
  } catch (error) { json(res, error.status || 400, { error: error.message, code: error.code }); }
});
const wss = new WebSocketServer({ noServer: true, maxPayload: 16384 });
server.on('upgrade', (req, socket, head) => {
  const url = new URL(req.url, `http://127.0.0.1:${port}`);
  if (url.pathname !== '/ws') return;
  const token = tokenFor(req);
  if (!token || ![`localhost:${port}`, `127.0.0.1:${port}`].includes(req.headers.host)) { socket.end('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n'); return; }
  if (req.headers.origin && ![`http://localhost:${port}`, `http://127.0.0.1:${port}`].includes(req.headers.origin)) return socket.destroy();
  const role = url.searchParams.get('role') === 'device' ? 'device' : 'viewer';
  if (role === 'device' && !req.headers.authorization) return socket.destroy();
  wss.handleUpgrade(req, socket, head, ws => {
    const relay = relayFor(token);
    try { relay.add(ws, role, Number(token.split('.')[0]) + SESSION_MS); } catch { ws.close(1008, 'Connection limit'); return; }
    ws.on('message', raw => {
      try { relay.message(ws, JSON.parse(raw)); }
      catch (error) { relay.send(ws, { type: 'error', protocol: EEG_PROTOCOL, code: error.code || 'INVALID_EEG', message: error.message }); }
    });
    ws.on('close', () => relay.remove(ws)); ws.on('error', () => relay.remove(ws));
  });
});
const timer = setInterval(() => { for (const [token, relay] of sessions) { relay.expire(); if (!validToken(token)) sessions.delete(token); } }, 1000);
if (!prod) vite = await (await import('vite')).createServer({ root, server: { middlewareMode: true, hmr: { server, host: '127.0.0.1' } }, appType: 'spa' });
server.listen(port, '127.0.0.1', () => console.log(`Mindscape ready → http://127.0.0.1:${port}`));
function shutdown() { clearInterval(timer); for (const ws of wss.clients) ws.terminate(); wss.close(); vite?.close(); server.close(() => process.exit(0)); }
process.on('SIGTERM', shutdown); process.on('SIGINT', shutdown);
