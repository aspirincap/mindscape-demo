import { WebSocket } from 'ws';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { EEG_PROTOCOL, EEG_FRESH_MS } from '../src/core/eeg-protocol.mjs';
export function pairingConfig(input) {
  let data;
  try { data = typeof input === 'string' ? JSON.parse(input) : input; } catch { throw new Error('接入配置不是有效 JSON'); }
  if (data?.protocol !== EEG_PROTOCOL) throw new Error(`请重新复制 ${EEG_PROTOCOL} 接入配置`);
  let ws, http;
  try { ws = new URL(data.websocket); http = new URL(data.http); } catch { throw new Error('接入地址格式错误'); }
  const cloud = ws.origin === 'wss://mindscape-demo.aspirincap.workers.dev';
  const local = ws.protocol === 'ws:' && ['127.0.0.1', 'localhost'].includes(ws.hostname) && ['5173', '5174', '5178', '5186', '8787'].includes(ws.port);
  if (!(cloud || local) || ws.pathname !== '/ws' || ws.search !== '?role=device' || ws.hash || ws.username || ws.password || http.origin !== ws.origin.replace(/^ws/, 'http') || http.pathname !== '/api/frame' || http.search || http.hash || http.username || http.password) throw new Error('仅允许本项目云端或指定回环开发地址');
  const token = data.authorization?.match(/^Bearer (.+)$/)?.[1];
  if (typeof token !== 'string' || !/^\d{13}\.[a-f0-9]{64}$/.test(token) || data.expiresAt !== Number(token.split('.')[0]) + 86400000) throw new Error('配对已过期或凭据无效，请重新复制配置');
  return { websocket: ws.href, http: http.href, authorization: data.authorization, expiresAt: data.expiresAt };
}
export class EEGForwarder {
  constructor(observations, onStatus = () => {}) {
    this.observations = observations; this.onStatus = onStatus; this.serial = 'disconnected'; this.generation = 0;
    this.state = { state: 'stopped', message: '尚未开始联动', sent: 0, reconnects: 0, lastSentAt: null };
  }
  status(state, message) { Object.assign(this.state, { state, message }); this.onStatus({ ...this.state }); }
  start(input) { const config = pairingConfig(input); this.stop(); this.config = config; this.attempt = 0; this.connect(this.generation); }
  stop(message = '联动已停止，串口监视继续') {
    this.generation++; clearTimeout(this.retry); clearInterval(this.timer); this.socket?.removeAllListeners(); this.socket?.on('error', () => {}); this.socket?.terminate();
    this.socket = null; this.config = null; this.lease = null; this.status('stopped', message);
  }
  fail(message) { this.stop(message); this.status('pairing-required', message); }
  serialState(state) { this.serial = state; this.sendStatus(); }
  sendStatus() { if (this.socket?.readyState === WebSocket.OPEN && this.lease) this.socket.send(JSON.stringify({ type: 'bridge-status', protocol: EEG_PROTOCOL, serial: this.serial })); }
  connect(generation) {
    if (generation !== this.generation || !this.config) return;
    this.status('connecting', '正在建立设备发送连接'); this.lease = null; this.lastKey = null;
    const ws = this.socket = new WebSocket(this.config.websocket, { headers: { Authorization: this.config.authorization }, handshakeTimeout: 8000, maxPayload: 16384,
      agent: this.config.websocket.startsWith('wss:') && process.env.HTTPS_PROXY ? new HttpsProxyAgent(process.env.HTTPS_PROXY) : undefined });
    let lastPong = performance.now();
    const ping = () => {
      if (generation !== this.generation) return;
        if (performance.now() - lastPong > 5000 || ws.bufferedAmount > 65536) return ws.terminate();
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'ping', protocol: EEG_PROTOCOL, id: ++this.pingId }));
    };
    ws.on('open', () => { this.pingId = 0; ping(); this.timer = setInterval(ping, 1000); });
    ws.on('message', raw => {
      if (generation !== this.generation) return;
      let d; try { d = JSON.parse(raw); } catch { return; }
      if (d.protocol && d.protocol !== EEG_PROTOCOL) return this.fail('服务端协议不匹配，请更新并重新配对');
      if (d.type === 'pong') { if (d.serverTime >= this.config.expiresAt) return this.fail('配对已过期，请重新复制配置'); lastPong = performance.now(); this.lease = d.lease; this.leaseAt = lastPong; this.attempt = 0; this.status('connected', '桥接已连接，按新设备读数发送'); this.sendStatus(); this.flush(); }
      if (d.type === 'error' && ['PROTOCOL_MISMATCH', 'SENDER_REPLACED', 'OLD_STREAM', 'REPAIR_REQUIRED'].includes(d.code)) this.fail('连接已被替换或版本不匹配，请重新配对');
    });
    ws.on('unexpected-response', (_req, res) => { res.resume(); this.fail([401, 403].includes(res.statusCode) ? '配对无效或过期，请重新复制配置' : '发送地址不可用，请核对配置'); });
    ws.on('error', () => {}); // Never log errors that can contain a credential or URL.
    ws.on('close', code => {
      clearInterval(this.timer);
      if (generation !== this.generation || !this.config) return;
      if ([4001, 4003, 1008].includes(code)) return this.fail('发送连接已失效，请重新配对');
      this.lease = null; this.state.reconnects++;
      const delay = Math.min(15000, 1000 * 2 ** this.attempt++) * (.85 + Math.random() * .3);
      this.status('retrying', '桥接中断，等待重连；不补发历史数据'); this.retry = setTimeout(() => this.connect(generation), delay);
    });
  }
  flush() {
    if (this.serial !== 'connected' || this.socket?.readyState !== WebSocket.OPEN || !this.lease || performance.now() - this.leaseAt >= 1500 || this.socket.bufferedAmount > 65536) return;
    const data = this.observations.snapshot(); if (!data) return;
    const key = `${data.streamId}:${data.seq}`;
    if (key === this.lastKey || !Object.values(data.frame.ageMs).some(age => age !== null && age < EEG_FRESH_MS)) return;
    this.socket.send(JSON.stringify({ ...data, lease: this.lease })); this.lastKey = key;
    this.state.sent++; this.state.lastSentAt = Date.now();
    const ages = ['attention', 'relaxation'].filter(k => data.frame.valid[k]).map(k => data.frame.ageMs[k]);
    if (ages.length) this.state.lastValidAt = Date.now() - Math.min(...ages);
  }
}
