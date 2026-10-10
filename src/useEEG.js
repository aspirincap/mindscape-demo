import { useEffect, useRef, useState } from 'react';
import { EEGFeedback } from './core/eeg-feedback.mjs';
import { EEGClock, EEG_PROTOCOL } from './core/eeg-protocol.mjs';
export function useEEG(options) {
  const processor = useRef(new EEGFeedback()), session = useRef(null), config = useRef(options); config.current = options;
  const [transport, setTransport] = useState({ connected: false, backend: 'local', message: '正在连接会话', bridge: false, serial: 'unknown' });
  const transportRef = useRef(transport); transportRef.current = transport;
  useEffect(() => { processor.current.reset(); }, [options.source]);
  useEffect(() => {
    let stopped = false, ws, retry, timer, expired = false, pingId = 0;
    const clock = new EEGClock(), pending = new Map();
    const update = value => { transportRef.current = { ...transportRef.current, ...value }; setTransport(transportRef.current); };
    session.current = fetch('/api/session').then(async res => { if (!res.ok) throw new Error('会话不可用'); const data = await res.json(); if (data.protocol !== EEG_PROTOCOL) throw new Error('请刷新并更新到匹配的协议版本'); return data; });
    session.current.catch(() => {});
    async function connect() {
      try {
        const data = await session.current; if (stopped) return;
        update({ backend: data.backend }); clock.reset(); pending.clear();
        ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`);
        ws.onopen = () => {
          update({ connected: true, message: '会话已连接' });
          const ping = () => { if (ws.readyState !== WebSocket.OPEN) return; const id = ++pingId; pending.set(id, performance.now()); for (const [k, at] of pending) if (performance.now() - at > 5000) pending.delete(k); ws.send(JSON.stringify({ type: 'ping', protocol: EEG_PROTOCOL, id })); };
          ping(); timer = setInterval(ping, 1000);
        };
        ws.onmessage = event => {
          let d; try { d = JSON.parse(event.data); } catch { return; }
          if (d.protocol !== EEG_PROTOCOL) { expired = true; update({ message: '协议不匹配，请刷新并更新客户端' }); ws.close(); return; }
          const now = performance.now();
          if (d.type === 'pong' && pending.has(d.id)) { clock.sync(pending.get(d.id), now, d.serverTime); pending.delete(d.id); }
          if (d.type === 'bridge-status') update({ bridge: d.connected, serial: d.serial });
          if (d.type === 'eeg-frame' && config.current.source === 'device') {
            processor.current.tick(now, { ...config.current, hidden: document.hidden, connected: true });
            processor.current.ingest(d, now, clock.age(d.receivedAt, now));
          }
        };
        ws.onclose = event => {
          clearInterval(timer); clock.reset(); if (stopped) return;
          expired ||= [4003, 1008].includes(event.code);
          update({ connected: false, bridge: false, message: expired ? '会话已失效，请刷新并重新配对' : '会话中断，正在重连' });
          if (!expired) retry = setTimeout(connect, 1800);
        };
        ws.onerror = () => ws.close();
      } catch (e) { if (!stopped) update({ connected: false, message: e.message }); }
    }
    const visibility = () => processor.current.tick(performance.now(), { ...config.current, hidden: document.hidden, connected: transportRef.current.connected });
    document.addEventListener('visibilitychange', visibility); connect();
    return () => { stopped = true; clearTimeout(retry); clearInterval(timer); ws?.close(); document.removeEventListener('visibilitychange', visibility); };
  }, []);
  async function copyPairing() {
    const data = await session.current;
    await navigator.clipboard.writeText(JSON.stringify({ protocol: EEG_PROTOCOL, http: `${location.origin}/api/frame`, websocket: `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws?role=device`, authorization: `Bearer ${data.token}`, expiresAt: data.expiresAt }, null, 2));
  }
  return { processor, session, transport, transportRef, copyPairing };
}
