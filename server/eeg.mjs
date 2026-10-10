import http from 'node:http';
import { EEGObservations } from './eeg-observations.mjs';
import { EEGForwarder } from './eeg-forwarder.mjs';
import { readdir, readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { resolve, extname, sep } from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const port = Number(process.env.EEG_PORT || 8765);
const origins = [`http://127.0.0.1:${port}`, `http://localhost:${port}`];
const clients = new Set();
const bauds = [9600, 19200, 38400, 57600, 115200];
let child, retry, stopping = false, desired = true;
let config = { port: process.env.EEG_DEVICE || '', baud: Number(process.env.EEG_BAUD || 9600) };
let state = { state: 'connecting', message: '正在寻找 USB 串口' };
let id = 0, pending = [], history = [], historyBytes = 0;
const stats = { bytes: 0, validPackets: 0, badChecksums: 0, decodeErrors: 0, raw16: 0, raw8: 0, unframedBytes: 0,
  startedAt: Date.now(), lastByteAt: null, lastPacketAt: null, values: {}, valueTimes: {} };

async function ports() {
  return (await readdir('/dev')).filter(name => /^cu\.(usbserial|usbmodem|wchusbserial|SLAB_USBtoUART)[-\w.]*$/.test(name)).sort().map(name => `/dev/${name}`);
}
function json(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(data));
}
function send(res, type, data) {
  if (res.writableLength > 2 * 1024 * 1024) { clients.delete(res); res.destroy(); return; }
  res.write(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`);
}
function broadcast(type, data) { for (const res of clients) send(res, type, data); }
const observations = new EEGObservations();
const forwarder = new EEGForwarder(observations, bridge => broadcast('bridge', bridge));
function status(next) { state = { ...next, ...config }; broadcast('status', state); forwarder.serialState(state.state); }
function ingest(event) {
  if (event.type === 'status') { status(event); return; }
  if (event.type !== 'data') return;
  event.id = ++id;
  event.port = config.port;
  event.baud = config.baud;
  stats.bytes += event.length;
  stats.lastByteAt = event.timestamp;
  stats.unframedBytes = event.unframedBytes;
  for (const p of event.packets) {
    if (!p.checksumValid) { stats.badChecksums++; continue; }
    stats.validPackets++;
    stats.lastPacketAt = event.timestamp;
    if (p.decodeError) { stats.decodeErrors++; continue; }
    observations.observe(p, event.timestamp, performance.now() - Math.max(0, Date.now() - event.timestamp));
    forwarder.flush();
    stats.raw16 += p.raw16.length;
    stats.raw8 += p.raw8.length;
    Object.assign(stats.values, p.values);
    for (const key of Object.keys(p.values)) stats.valueTimes[key] = event.timestamp;
  }
  pending.push(event);
  const size = JSON.stringify(event).length;
  history.push({ event, size }); historyBytes += size;
  while (history.length > 500 || historyBytes > 2 * 1024 * 1024) historyBytes -= history.shift().size;
}
async function start() {
  clearTimeout(retry);
  if (child || stopping || !desired) return;
  try {
    const available = await ports();
    if (stopping || !desired || child) return;
    if (!config.port) config.port = available[0] || '';
    if (!available.includes(config.port)) throw new Error(config.port ? '找不到所选串口，等待重新插入设备' : '未检测到 USB 串口，请插入适配器');
    if (!bauds.includes(config.baud)) throw new Error('不支持的波特率');
    stats.values = {}; stats.valueTimes = {}; stats.lastByteAt = null; stats.lastPacketAt = null;
    observations.reset();
    status({ state: 'connecting', message: '正在打开串口' });
    const worker = spawn(process.env.EEG_PYTHON || 'python3', ['-u', resolve(root, 'scripts/eeg_serial.py'), '--port', config.port, '--baud', String(config.baud)], { stdio: ['ignore', 'pipe', 'pipe'] });
    child = worker;
    let stderr = '';
    worker.stderr.on('data', b => { stderr = (stderr + b).slice(-2000); });
    createInterface({ input: worker.stdout }).on('line', line => {
      try { ingest(JSON.parse(line)); } catch { status({ state: 'error', message: '串口服务返回了无效数据' }); }
    });
    worker.on('error', error => status({ state: 'error', message: error.message }));
    worker.on('close', () => {
      if (child === worker) child = null;
      if (stopping) return;
      if (!desired) status({ state: 'disconnected', message: '串口已释放' });
      else {
        if (state.state !== 'error') status({ state: 'error', message: stderr || '串口已断开，正在重试' });
        retry = setTimeout(start, 2500);
      }
    });
  } catch (error) {
    status({ state: 'error', message: error.message });
    if (desired && !stopping) retry = setTimeout(start, 2500);
  }
}
async function readBody(req) {
  let text = '';
  for await (const chunk of req) { text += chunk; if (text.length > 8192) throw new Error('请求过大'); }
  return JSON.parse(text || '{}');
}
const prod = process.env.NODE_ENV === 'production';
let vite;
const server = http.createServer(async (req, res) => {
  try {
    if (![`127.0.0.1:${port}`, `localhost:${port}`].includes(req.headers.host)) return json(res, 403, { error: 'Host rejected' });
    if (req.headers.origin && !origins.includes(req.headers.origin)) return json(res, 403, { error: 'Origin rejected' });
    const url = new URL(req.url, origins[0]);
    if (url.pathname === '/api/eeg/status' && req.method === 'GET') return json(res, 200, { ...state, stats, ports: await ports(), bauds, bridge: forwarder.state });
    if (url.pathname === '/api/eeg/events' && req.method === 'GET') {
      if (clients.size >= 10) return json(res, 429, { error: '监视页面过多，请关闭部分页面' });
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-store', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
      send(res, 'snapshot', { state, stats, bridge: forwarder.state, events: history.map(h => h.event) });
      clients.add(res);
      res.on('close', () => clients.delete(res));
      return;
    }
    if (url.pathname === '/api/eeg/forward' && req.method === 'POST') {
      const data = await readBody(req);
      if (data.action === 'stop') forwarder.stop();
      else if (data.action === 'start') forwarder.start(data.config);
      else return json(res, 400, { error: '未知联动操作' });
      return json(res, 200, { bridge: forwarder.state });
    }
    if (url.pathname === '/api/eeg/disconnect' && req.method === 'POST') {
      desired = false; clearTimeout(retry);
      if (child) { status({ state: 'disconnecting', message: '正在释放串口' }); child.kill('SIGTERM'); }
      else status({ state: 'disconnected', message: '串口已释放' });
      return json(res, 200, { ok: true });
    }
    if (url.pathname === '/api/eeg/connect' && req.method === 'POST') {
      const next = await readBody(req);
      if (child) return json(res, 409, { error: '请先断开当前串口' });
      if (!(await ports()).includes(next.port) || !bauds.includes(Number(next.baud))) return json(res, 400, { error: '请选择可用串口和波特率' });
      config = { port: next.port, baud: Number(next.baud) }; desired = true;
      await start(); return json(res, 200, { ok: true });
    }
    if (url.pathname.startsWith('/api/')) return json(res, 404, { error: '接口不存在' });
    if (url.pathname === '/' || url.pathname === '/eeg') req.url = '/eeg.html';
    if (vite) return vite.middlewares(req, res);
    const dist = resolve(root, 'dist');
    const path = resolve(dist, '.' + decodeURIComponent(req.url.split('?')[0]));
    if (!path.startsWith(dist + sep)) return json(res, 403, { error: 'Forbidden' });
    const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.ttf': 'font/ttf', '.svg': 'image/svg+xml' };
    try { const file = await readFile(path); res.writeHead(200, { 'Content-Type': mime[extname(path)] || 'application/octet-stream' }); res.end(file); }
    catch { res.writeHead(404); res.end('Not found'); }
  } catch (error) { json(res, 400, { error: error.message }); }
});
if (!prod) vite = await (await import('vite')).createServer({ root, cacheDir: 'node_modules/.vite-eeg',
  resolve: { dedupe: ['react', 'react-dom'] }, optimizeDeps: { entries: ['eeg.html'] },
  server: { middlewareMode: true, hmr: { server } }, appType: 'mpa' });
const tick = setInterval(() => {
  if (pending.length) { const events = pending; pending = []; broadcast('update', { events, stats }); }
}, 100);
const heartbeat = setInterval(() => broadcast('heartbeat', { now: Date.now() }), 10000);
server.on('error', error => { console.error(error.message); shutdown(); });
server.listen(port, '127.0.0.1', () => { console.log(`EEG monitor → http://127.0.0.1:${port}`); start(); });
async function shutdown() {
  if (stopping) return;
  stopping = true; desired = false; forwarder.stop();
  clearTimeout(retry); clearInterval(tick); clearInterval(heartbeat);
  if (child) {
    const current = child;
    const closed = new Promise(resolve => current.once('close', resolve));
    current.kill('SIGTERM');
    await Promise.race([closed, new Promise(resolve => setTimeout(resolve, 1500))]);
    if (child) current.kill('SIGKILL');
  }
  for (const res of clients) res.end();
  await vite?.close();
  server.close(() => process.exit(0));
}
process.on('SIGTERM', shutdown); process.on('SIGINT', shutdown);
