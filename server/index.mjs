import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer, WebSocket } from 'ws';
import { validateFrame, chooseWorld } from '../src/core/state.mjs';
import { LOCATIONS } from '../src/core/locations.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const port = Number(process.env.PORT || 5173);
const prod = process.env.NODE_ENV === 'production';
let vite = null;
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.geojson': 'application/geo+json', '.svg': 'image/svg+xml', '.png': 'image/png', '.bin': 'application/octet-stream', '.ply': 'application/octet-stream', '.woff2': 'font/woff2', '.wasm': 'application/wasm', '.task': 'application/octet-stream' };
let latestFrame = null;
let receivedAt = 0;
async function body(req) {
  let value = '';
  for await (const chunk of req) {
    value += chunk;
    if (value.length > 16384) throw new Error('请求内容过大');
  }
  return JSON.parse(value);
}
function json(res, status, data) { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(data)); }
function receive(data) { latestFrame = validateFrame(data); receivedAt = Date.now(); }
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://127.0.0.1:${port}`);
    // Loopback service; reject cross-origin mutation from other websites.
    if (req.headers.origin && ![`http://localhost:${port}`, `http://127.0.0.1:${port}`].includes(req.headers.origin)) return json(res, 403, { error: 'Origin rejected' });
    if (url.pathname === '/api/session' && req.method === 'GET') return json(res, 200, { backend: 'local', router: 'local-rules' });
    if (url.pathname === '/api/health') return json(res, 200, { ok: true, worlds: LOCATIONS.map(l => l.worldId), sensorFresh: Date.now() - receivedAt < 2500, router: 'local-rules' });
    if (url.pathname === '/api/locations') return json(res, 200, { locations: LOCATIONS });
    if (url.pathname === '/api/frame' && req.method === 'POST') { receive(await body(req)); return json(res, 200, { ok: true }); }
    if (url.pathname === '/api/route' && req.method === 'POST') {
      const data = await body(req);
      const frame = data.frame ? validateFrame(data.frame) : undefined;
      if (typeof data.text !== 'string' || !data.text.trim()) return json(res, 400, { error: '请先描述你想去的地方' });
      return json(res, 200, chooseWorld(data.text.slice(0, 1000), frame));
    }
    if (url.pathname.startsWith('/api/')) return json(res, 404, { error: 'Unknown API endpoint' });
    if (vite) return vite.middlewares(req, res);
    const dist = resolve(root, 'dist');
    const path = resolve(dist, '.' + decodeURIComponent(url.pathname));
    if (!path.startsWith(dist + sep) && path !== dist) return json(res, 403, { error: 'Forbidden' });
    const file = path === dist || url.pathname === '/' ? resolve(dist, 'index.html') : path;
    try { const content = await readFile(file); res.writeHead(200, { 'Content-Type': mime[extname(file)] || 'application/octet-stream' }); res.end(content); }
    catch { res.writeHead(404); res.end('Not found'); }
  } catch (error) { json(res, 400, { error: error.message }); }
});
const wss = new WebSocketServer({ noServer: true, maxPayload: 16384 });
server.on('upgrade', (req, socket, head) => {
  if (req.url !== '/ws') return;
  if (req.headers.origin && ![`http://localhost:${port}`, `http://127.0.0.1:${port}`].includes(req.headers.origin)) return socket.destroy();
  wss.handleUpgrade(req, socket, head, ws => wss.emit('connection', ws));
});
wss.on('connection', ws => {
  ws.send(JSON.stringify({ type: 'hello', protocol: 'mindscape.v1' }));
  ws.on('message', raw => {
    try {
      const data = JSON.parse(raw);
      if (data.type !== 'sensor') throw new Error('Expected type: sensor');
      receive(data.frame);
    } catch (error) { ws.send(JSON.stringify({ type: 'error', message: error.message })); }
  });
});
const timer = setInterval(() => {
  if (!latestFrame) return;
  const stale = Date.now() - receivedAt > 2500;
  const payload = JSON.stringify({ type: 'frame', timestamp: receivedAt, frame: { ...latestFrame, signalQuality: stale ? 0 : latestFrame.signalQuality }, stale });
  for (const client of wss.clients) if (client.readyState === WebSocket.OPEN && client.bufferedAmount < 65536) client.send(payload);
}, 40);
if (!prod) vite = await (await import('vite')).createServer({ root, server: { middlewareMode: true, hmr: { server, host: '127.0.0.1' } }, appType: 'spa' });
server.listen(port, '127.0.0.1', () => console.log(`Mindscape ready → http://127.0.0.1:${port}`));
function shutdown() { clearInterval(timer); wss.close(); vite?.close(); server.close(() => process.exit(0)); }
process.on('SIGTERM', shutdown); process.on('SIGINT', shutdown);
