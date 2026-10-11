import React, { useState } from 'react';
export function ForwardPanel({ bridge, command }) {
  const [config, setConfig] = useState('');
  return <section className="connection-section forward-panel"><h2>连接在野</h2>
    <p className="connection-note">在体验页面选择设备接入并复制配置。仅发送专注、冥想和接触质量；原始字节与频段留在此 Mac。</p>
    <label htmlFor="mindscape-pairing">粘贴会话配置</label><textarea id="mindscape-pairing" value={config} onChange={e => setConfig(e.target.value)} rows="4" autoComplete="off" spellCheck="false" placeholder="mindscape.eeg.v2 配对 JSON"/>
    <button className="connection-button" disabled={!config.trim()} onClick={async () => { const ok = await command('forward', { action: 'start', config }); if (ok) setConfig(''); }}>开始联动</button>
    <button className="text-button" onClick={() => command('forward', { action: 'stop' })}>停止联动（保留串口）</button>
    <p role="status">{bridge?.message || '尚未开始联动'}</p><p className="connection-note">已发送 {bridge?.sent || 0} 个新观测 · 重连 {bridge?.reconnects || 0} 次<br/>最近发送 {bridge?.lastSentAt ? new Date(bridge.lastSentAt).toLocaleTimeString() : '—'}<br/>最近有效读数 {bridge?.lastValidAt ? new Date(bridge.lastValidAt).toLocaleTimeString() : '—'}</p>
  </section>;
}
