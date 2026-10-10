import { EEG_PROTOCOL, EEG_FRESH_MS, EEGSequence, EEGError, validateEEG } from '../src/core/eeg-protocol.mjs';

// Shared by Node and the DO. Memory only, no EEG history / replay to new viewers.
export class EEGSession {
  constructor({ now = () => Date.now(), uuid = () => crypto.randomUUID() } = {}) {
    this.now = now; this.uuid = uuid; this.peers = new Map(); this.sequence = new EEGSequence(); this.owner = null; this.leases = new Map(); this.lastValidAt = 0;
  }
  send(peer, data) { try { peer.send(JSON.stringify(data)); } catch { this.remove(peer); } }
  broadcast(data) { for (const [peer, state] of this.peers) if (state.role === 'viewer') this.send(peer, data); }
  add(peer, role, expiresAt) {
    if (this.peers.size >= 6) throw new EEGError('会话连接数已满', 'CONNECTION_LIMIT', 429);
    this.peers.set(peer, { role, expiresAt, id: this.uuid() });
    this.send(peer, { type: 'hello', protocol: EEG_PROTOCOL, role, serverTime: this.now() });
  }
  claim(id) {
    if (this.owner !== id) {
      for (const [peer, s] of this.peers) if (s.id === this.owner) { this.peers.delete(peer); peer.close(4001, 'Sender replaced'); }
      this.owner = id; this.leases.clear();
    }
  }
  lease(id) {
    for (const [key, l] of this.leases) if (this.now() - l.at >= EEG_FRESH_MS) this.leases.delete(key);
    const lease = this.uuid(); this.leases.set(lease, { owner: id, at: this.now() }); return lease;
  }
  httpClaim() { const id = this.uuid(); this.claim(id); return { connectionId: id, lease: this.lease(id), protocol: EEG_PROTOCOL, serverTime: this.now() }; }
  receive(id, data) {
    validateEEG(data);
    if (id !== this.owner) throw new EEGError('发送连接已被替换，请重新配对', 'SENDER_REPLACED', 409);
    const lease = this.leases.get(data.lease), now = this.now();
    if (!lease || lease.owner !== id || now - lease.at >= EEG_FRESH_MS) throw new EEGError('链路延迟过大或缺少时效握手', 'STALE_TRANSPORT', 409);
    const normalized = this.sequence.accept(data, now, now - lease.at);
    if (normalized.frame.valid.attention || normalized.frame.valid.relaxation) this.lastValidAt = now - Math.min(...['attention', 'relaxation'].filter(k => normalized.frame.valid[k]).map(k => Math.max(normalized.frame.ageMs[k], normalized.frame.ageMs.poorSignal)));
    this.broadcast({ ...normalized, type: 'eeg-frame', receivedAt: now });
    return { type: 'ack', seq: normalized.seq, protocol: EEG_PROTOCOL };
  }
  message(peer, data) {
    const s = this.peers.get(peer);
    if (!s) throw new EEGError('发送连接已经关闭', 'SENDER_REPLACED', 409);
    if (s.expiresAt <= this.now()) { peer.close(4003, 'Session expired'); this.remove(peer); return; }
    if (data.protocol !== EEG_PROTOCOL) throw new EEGError(`协议不匹配，请更新采集客户端至 ${EEG_PROTOCOL}`, 'PROTOCOL_MISMATCH');
    const second = Math.floor(this.now() / 1000);
    s.count = s.second === second ? s.count + 1 : 1; s.second = second;
    if (s.count > 20) throw new EEGError('发送频率过高', 'RATE_LIMIT', 429);
    if (data.type === 'ping') {
      if (s.role === 'device') this.claim(s.id);
      this.send(peer, { type: 'pong', protocol: EEG_PROTOCOL, id: data.id, serverTime: this.now(), ...(s.role === 'device' ? { lease: this.lease(s.id) } : {}) }); return;
    }
    if (data.type === 'bridge-status' && s.role === 'device' && this.owner === s.id) {
      this.broadcast({ type: 'bridge-status', protocol: EEG_PROTOCOL, serial: ['connected', 'connecting', 'disconnected', 'error'].includes(data.serial) ? data.serial : 'disconnected', connected: true }); return;
    }
    if (s.role !== 'device' || data.type !== 'sensor') throw new EEGError('当前连接不能发送设备数据');
    this.send(peer, this.receive(s.id, data));
  }
  remove(peer) {
    const s = this.peers.get(peer); this.peers.delete(peer);
    if (s?.id === this.owner) this.broadcast({ type: 'bridge-status', protocol: EEG_PROTOCOL, connected: false, serial: 'unknown' });
  }
  expire() { for (const [peer, s] of this.peers) if (s.expiresAt <= this.now()) { peer.close(4003, 'Session expired'); this.remove(peer); } }
  health() { return { sensorFresh: this.lastValidAt > 0 && this.now() - this.lastValidAt < EEG_FRESH_MS, protocol: EEG_PROTOCOL }; }
}
