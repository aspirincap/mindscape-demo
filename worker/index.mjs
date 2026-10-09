import { DurableObject } from 'cloudflare:workers';
import { LOCATIONS } from '../src/core/locations.mjs';
import { validateFrame } from '../src/core/state.mjs';
import { COOKIE, SESSION_MS, json, readJson, sameOrigin, sessionToken } from './common.mjs';
import { recommend, routeInput, fallback } from './recommend.mjs';

export default {
  async fetch(request, env) {
    const url = new URL(request.url), path = url.pathname;
    if (!path.startsWith('/api/') && path !== '/ws') return env.ASSETS.fetch(request);
    if (!sameOrigin(request)) return json({ error: 'Origin rejected' }, 403);
    try {
      const token = sessionToken(request);
      if (path === '/api/session' && request.method === 'GET') {
        const current = token || `${Date.now()}.${crypto.randomUUID().replaceAll('-', '')}${crypto.randomUUID().replaceAll('-', '')}`;
        return json({ backend: 'cloudflare', router: 'ai-gateway', token: current, expiresAt: Number(current.split('.')[0]) + SESSION_MS }, 200,
          { 'Set-Cookie': `${COOKIE}=${current}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${Math.floor((Number(current.split('.')[0]) + SESSION_MS - Date.now()) / 1000)}${url.protocol === 'https:' ? '; Secure' : ''}` });
      }
      if (path === '/api/locations' && request.method === 'GET') return json({ locations: LOCATIONS });
      if (path === '/api/health' && request.method === 'GET') {
        const state = token ? await env.SESSIONS.get(env.SESSIONS.idFromName(token)).fetch(new Request('https://session/health')).then(r => r.json()) : { sensorFresh: false };
        return json({ ok: true, backend: 'cloudflare-workers', worlds: LOCATIONS.map(l => l.worldId), ...state, router: 'ai-gateway', gateway: env.AI_GATEWAY_ID, model: env.AI_MODEL });
      }
      if (!['/api/route', '/api/frame', '/ws'].includes(path)) return json({ error: 'Unknown API endpoint' }, 404);
      if (!token) return json({ error: '请先初始化会话，或携带设备配对凭据' }, 401);
      if (path === '/ws') {
        if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') return json({ error: 'Expected WebSocket' }, 426);
        return env.SESSIONS.get(env.SESSIONS.idFromName(token)).fetch(request);
      }
      if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405, { Allow: 'POST' });
      if (path === '/api/frame') {
        const frame = validateFrame(await readJson(request));
        return env.SESSIONS.get(env.SESSIONS.idFromName(token)).fetch(new Request('https://session/frame', { method: 'POST', body: JSON.stringify(frame) }));
      }
      const input = routeInput(await readJson(request));
      const ip = request.headers.get('CF-Connecting-IP') || 'local';
      const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(ip)))).map(v => v.toString(16).padStart(2, '0')).join('');
      const budget = await env.AI_BUDGET.get(env.AI_BUDGET.idFromName('recommendations')).consume(digest);
      if (!budget.allowed) return json(fallback(input, 'rate-limited'));
      return json(await recommend(input, env));
    } catch (error) {
      if (error instanceof SyntaxError || error instanceof TypeError) return json({ error: '请求格式无效' }, 400);
      return json({ error: '请求无效或服务暂不可用' }, 400);
    }
  },
};

// Each unguessable session has its own hibernating sockets. No sensor history is written to storage.
export class SensorSession extends DurableObject {
  latest() {
    return this.ctx.getWebSockets().map(ws => ws.deserializeAttachment()?.latest).filter(Boolean).sort((a, b) => b.timestamp - a.timestamp)[0];
  }
  async fetch(request) {
    const path = new URL(request.url).pathname;
    if (path === '/health') return json({ sensorFresh: Date.now() - (this.latest()?.timestamp || 0) < 2500 });
    if (path === '/frame') { this.broadcast(await request.json()); return json({ ok: true }); }
    if (this.ctx.getWebSockets().length >= 6) return json({ error: '会话连接数已满' }, 429);
    const latest = this.latest();
    const [client, server] = Object.values(new WebSocketPair());
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ created: Date.now(), expiresAt: Number(sessionToken(request).split('.')[0]) + SESSION_MS, latest });
    server.send(JSON.stringify({ type: 'hello', protocol: 'mindscape.v1', backend: 'cloudflare', isolated: true }));
    if (latest && Date.now() - latest.timestamp < 2500) server.send(JSON.stringify(latest));
    return new Response(null, { status: 101, webSocket: client });
  }
  broadcast(frame) {
    const payload = { type: 'frame', timestamp: Date.now(), frame, stale: false };
    for (const socket of this.ctx.getWebSockets()) {
      try {
        const state = socket.deserializeAttachment() || {};
        if (state.expiresAt <= Date.now()) { socket.close(1008, 'Session expired'); continue; }
        socket.serializeAttachment({ ...state, latest: payload });
        socket.send(JSON.stringify(payload));
      } catch { socket.close(1011, 'Reconnect'); }
    }
  }
  webSocketMessage(socket, raw) {
    try {
      if (typeof raw !== 'string' || raw.length > 16384) throw new Error('Invalid message');
      const state = socket.deserializeAttachment() || {};
      if (state.expiresAt <= Date.now()) { socket.close(1008, 'Session expired'); return; }
      const now = Date.now();
      // At most 50 incoming frames/second per socket; rendering smooths independently.
      if (Math.floor(now / 1000) === state.second && state.count >= 50) return;
      socket.serializeAttachment({ ...state, second: Math.floor(now / 1000), count: Math.floor(now / 1000) === state.second ? state.count + 1 : 1 });
      const data = JSON.parse(raw);
      if (data.type !== 'sensor') throw new Error('Expected type: sensor');
      this.broadcast(validateFrame(data.frame));
    } catch { socket.send(JSON.stringify({ type: 'error', message: '无效的传感器帧' })); }
  }
  webSocketClose(socket, code) { socket.close(code === 1006 ? 1000 : code); }
  webSocketError(socket) { socket.close(1011, 'Reconnect'); }
}

// Serialized persistent budget prevents new browser sessions from bypassing the AI cap.
export class AiBudget extends DurableObject {
  async consume(ipHash) {
    const now = Date.now(), day = Math.floor(now / 86400000), minute = Math.floor(now / 60000);
    return this.ctx.storage.transaction(async tx => {
      let state = await tx.get('budget');
      if (!state || state.day !== day) state = { day, total: 0, minute, ips: {}, minuteTotal: 0 };
      if (state.minute !== minute) { state.minute = minute; state.ips = {}; state.minuteTotal = 0; }
      if (state.total >= Number(this.env.AI_DAILY_LIMIT || 200) || state.minuteTotal >= 20 || (state.ips[ipHash] || 0) >= 6) return { allowed: false };
      state.total++; state.minuteTotal++; state.ips[ipHash] = (state.ips[ipHash] || 0) + 1;
      await tx.put('budget', state);
      return { allowed: true };
    });
  }
}
