import { terrainResponse } from './terrain.mjs';
import { sceneResponse } from './scenes.mjs';
import { DurableObject } from 'cloudflare:workers';
import { LOCATIONS } from '../src/core/locations.mjs';
import { EEG_PROTOCOL, EEGError } from '../src/core/eeg-protocol.mjs';
import { EEGSession } from './eeg-session.mjs';
import { COOKIE, SESSION_MS, json, readJson, sameOrigin, sessionToken } from './common.mjs';
import { recommend, routeInput, fallback } from './recommend.mjs';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url), path = url.pathname;
    if (path.startsWith('/terrain-data/') || path.startsWith('/scene-data/')) {
      const cache = caches.default;
      if (request.method === 'GET') { const cached = await cache.match(request); if (cached) return cached; }
      const response = await (path.startsWith('/scene-data/') ? sceneResponse : terrainResponse)(request, env.TERRAIN);
      if (response.ok && request.method === 'GET') ctx.waitUntil(cache.put(request, response.clone()));
      return response;
    }
    if (!path.startsWith('/api/') && path !== '/ws') return env.ASSETS.fetch(request);
    if (!sameOrigin(request)) return json({ error: 'Origin rejected' }, 403);
    try {
      const token = sessionToken(request);
      if (path === '/api/session' && request.method === 'GET') {
        const current = token || `${Date.now()}.${crypto.randomUUID().replaceAll('-', '')}${crypto.randomUUID().replaceAll('-', '')}`;
        return json({ backend: 'cloudflare', protocol: EEG_PROTOCOL, router: 'ai-gateway', token: current, expiresAt: Number(current.split('.')[0]) + SESSION_MS }, 200,
          { 'Set-Cookie': `${COOKIE}=${current}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${Math.floor((Number(current.split('.')[0]) + SESSION_MS - Date.now()) / 1000)}${url.protocol === 'https:' ? '; Secure' : ''}` });
      }
      if (path === '/api/locations' && request.method === 'GET') return json({ locations: LOCATIONS });
      if (path === '/api/health' && request.method === 'GET') {
        const state = token ? await env.SESSIONS.get(env.SESSIONS.idFromName(token)).fetch(new Request('https://session/health')).then(r => r.json()) : { sensorFresh: false };
        return json({ ok: true, backend: 'cloudflare-workers', worlds: LOCATIONS.map(l => l.worldId), ...state, router: 'ai-gateway', gateway: env.AI_GATEWAY_ID, model: env.AI_MODEL });
      }
      if (!['/api/route', '/api/frame', '/api/eeg/lease', '/ws'].includes(path)) return json({ error: 'Unknown API endpoint' }, 404);
      if (!token) return json({ error: '请先初始化会话，或携带设备配对凭据' }, 401);
      if (path === '/ws') {
        if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') return json({ error: 'Expected WebSocket' }, 426);
        return env.SESSIONS.get(env.SESSIONS.idFromName(token)).fetch(request);
      }
      if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405, { Allow: 'POST' });
      if (path === '/api/eeg/lease') {
        if (!request.headers.has('Authorization')) return json({ error: '请携带配对凭据' }, 401);
        const data = await readJson(request);
        if (data.protocol !== EEG_PROTOCOL) throw new EEGError('协议不匹配，请更新客户端', 'PROTOCOL_MISMATCH');
        return env.SESSIONS.get(env.SESSIONS.idFromName(token)).fetch(new Request('https://session/lease', { method: 'POST' }));
      }
      if (path === '/api/frame') {
        if (!request.headers.has('Authorization')) return json({ error: '设备发送须携带 Authorization' }, 401);
        const data = await readJson(request);
        return env.SESSIONS.get(env.SESSIONS.idFromName(token)).fetch(new Request('https://session/frame', { method: 'POST', body: JSON.stringify(data) }));
      }
      const input = routeInput(await readJson(request));
      const ip = request.headers.get('CF-Connecting-IP') || 'local';
      const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(ip)))).map(v => v.toString(16).padStart(2, '0')).join('');
      const budget = await env.AI_BUDGET.get(env.AI_BUDGET.idFromName('recommendations')).consume(digest);
      if (!budget.allowed) return json(fallback(input, 'rate-limited'));
      return json(await recommend(input, env));
    } catch (error) {
      if (error instanceof EEGError) return json({ error: error.message, code: error.code }, error.status);
      if (error instanceof SyntaxError || error instanceof TypeError) return json({ error: '请求格式无效' }, 400);
      return json({ error: '请求无效或服务暂不可用' }, 400);
    }
  },
};

// Each token routes to an isolated, memory-only relay; no EEG history is persisted.
export class SensorSession extends DurableObject {
  constructor(ctx, env) { super(ctx, env); this.relay = new EEGSession(); }
  async fetch(request) {
    try {
      const path = new URL(request.url).pathname;
      if (path === '/health') return json(this.relay.health());
      if (path === '/lease') return json(this.relay.httpClaim());
      if (path === '/frame') { const data = await request.json(); return json(this.relay.receive(data.connectionId, data)); }
      const role = new URL(request.url).searchParams.get('role') === 'device' ? 'device' : 'viewer';
      if (role === 'device' && !request.headers.has('Authorization')) return json({ error: '设备发送须携带 Authorization' }, 401);
      if (this.relay.peers.size >= 6) return json({ error: '会话连接数已满' }, 429);
      const [client, server] = Object.values(new WebSocketPair()); server.accept();
      this.relay.add(server, role, Number(sessionToken(request).split('.')[0]) + SESSION_MS);
      server.addEventListener('message', event => {
        try {
          if (typeof event.data !== 'string' || event.data.length > 16384) throw new EEGError('消息过大');
          this.relay.message(server, JSON.parse(event.data));
        } catch (error) { this.relay.send(server, { type: 'error', protocol: EEG_PROTOCOL, code: error.code || 'INVALID_EEG', message: error instanceof EEGError ? error.message : '无效消息' }); }
      });
      const close = () => { this.relay.remove(server); if (!this.relay.peers.size) { clearInterval(this.timer); this.timer = null; } };
      server.addEventListener('close', close); server.addEventListener('error', close);
      if (!this.timer) this.timer = setInterval(() => this.relay.expire(), 1000);
      return new Response(null, { status: 101, webSocket: client });
    } catch (error) { return json({ error: error instanceof EEGError ? error.message : '无效请求', code: error.code || 'INVALID_EEG' }, error.status || 400); }
  }
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
