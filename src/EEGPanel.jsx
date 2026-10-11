import React from 'react';
import './eeg-feedback.css';
function Trend({ points, label }) {
  const end = points.at(-1)?.at || 0, start = end - 30000;
  let path = '', previous;
  for (const p of points.filter(p => p.at >= start)) {
    if (p.value === null) { previous = null; continue; }
    path += `${previous && p.at - previous.at < 2500 ? 'L' : 'M'}${((p.at - start) / 30000 * 280).toFixed(1)},${(48 - p.value * 40).toFixed(1)} `; previous = p;
  }
  return <svg viewBox="0 0 280 56" role="img" aria-label={`${label}独立读数趋势，断点表示无效或过期`}><path d={path} stroke="currentColor" fill="none" strokeWidth="1.5"/></svg>;
}
export function EEGPanel({ connection, live, processor, enabled, onToggle, onCopy, onCalibrate }) {
  const cal = live.calibration || { state: 'idle', elapsed: 0, counts: { attention: 0, relaxation: 0 } };
  const score = k => live[k] == null ? '—' : Math.round(live[k] * 100);
  return <section className="eeg-feedback" aria-label="脑电接入与氛围">
    <div className="eeg-status-grid"><div><span>本机采集</span><b>{connection.serial === 'connected' ? '串口已连接' : connection.serial === 'unknown' ? '等待采集桥接' : '串口未就绪'}</b></div><div><span>云端桥接</span><b>{connection.connected && connection.bridge ? '发送端已连接' : connection.message}</b></div><div><span>指标有效</span><b>{live.status || '等待设备'}</b></div><div><span>个人基线</span><b>{live.baseline ? '本采集流已校准' : '未校准 · 温和默认映射'}</b></div></div>
    <div className="eeg-readings"><div><span>专注相对分</span><strong data-testid="eeg-attention">{score('attention')}</strong></div><div><span>冥想相对分</span><strong data-testid="eeg-relaxation">{score('relaxation')}</strong></div><div><span>心率</span><strong>{live.HR == null ? '未接入' : `${Math.round(live.HR)} BPM`}</strong></div></div>
    <p className="device-hint">最近有效读数：专注 {live.lastValidAgeMs?.attention == null ? '尚无' : `${(live.lastValidAgeMs.attention / 1000).toFixed(1)} 秒前`} · 冥想 {live.lastValidAgeMs?.relaxation == null ? '尚无' : `${(live.lastValidAgeMs.relaxation / 1000).toFixed(1)} 秒前`}</p>
    <p className="device-hint">设备相对指标 1–100；无效读数显示空值。接触质量 {live.poorSignal ?? '—'}，不表示准确率。</p>
    <div className="eeg-actions"><button className="primary" onClick={onToggle} aria-pressed={enabled}>{enabled ? '停止脑电氛围' : '开始脑电氛围'}</button><button className="text-button" onClick={onCopy}>复制设备接入配置</button></div>
    <p className="device-hint">启动本地 EEG Studio，在「连接在野」粘贴配置并开始联动。停止氛围只恢复手动设置，不释放串口。</p>
    <button className="text-button" disabled={cal.state === 'collecting'} onClick={onCalibrate}>{live.baseline ? '重新校准' : '校准个人基线'}</button>
    <p role="status">{cal.state === 'collecting' ? `校准 ${Math.floor(cal.elapsed)} / 30 秒 · 专注 ${cal.counts.attention} / 25 · 冥想 ${cal.counts.relaxation} / 25` : cal.state === 'failed' ? '校准失败：60 秒内有效独立样本不足，请调整接触后重试' : cal.state === 'complete' ? '个人基线已建立' : '自然睁眼静坐，至少 30 秒及每项 25 个新读数；最多等待 60 秒。'}</p>
    <div className="eeg-controls-readout">视觉响应量（非设备分数）：专注 {(live.attentionControl ?? .5).toFixed(2)} · 冥想 {(live.relaxationControl ?? .5).toFixed(2)}</div>
    {['attention', 'relaxation'].map(k => <div className="eeg-trend" key={k}><span>{k === 'attention' ? '专注' : '冥想'} · 独立样本 / 最近 30 秒</span><Trend points={processor.history[k]} label={k === 'attention' ? '专注' : '冥想'}/></div>)}
    <p className="device-hint">在「视觉调节」切换原始点云可作中性对照。镜头始终由鼠标、键盘或单手控制；信号中断时保留氛围，环境音不代表实时脑电响应。</p>
  </section>;
}
