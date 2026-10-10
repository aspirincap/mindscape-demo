import { ForwardPanel } from './ForwardPanel';
import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Waveform } from '@phosphor-icons/react/dist/csr/Waveform';
import { Plug } from '@phosphor-icons/react/dist/csr/Plug';
import { Pause } from '@phosphor-icons/react/dist/csr/Pause';
import { Play } from '@phosphor-icons/react/dist/csr/Play';
import { DownloadSimple } from '@phosphor-icons/react/dist/csr/DownloadSimple';
import { ArrowClockwise } from '@phosphor-icons/react/dist/csr/ArrowClockwise';
import { Trash } from '@phosphor-icons/react/dist/csr/Trash';
import { Copy } from '@phosphor-icons/react/dist/csr/Copy';
import { Check } from '@phosphor-icons/react/dist/csr/Check';
import { Terminal } from '@phosphor-icons/react/dist/csr/Terminal';
import { createCapture, appendEvents, clearCapture, rawBytes, qualityLabel, MAX_EVENTS } from './model.mjs';
import './monitor.css';

const num = value => (value ?? 0).toLocaleString('en-US');
const time = timestamp => new Date(timestamp).toLocaleTimeString('en-GB', { hour12: false }) + '.' + String(timestamp % 1000).padStart(3, '0');
const bandNames = { delta: 'Delta', theta: 'Theta', lowAlpha: 'Low alpha', highAlpha: 'High alpha', lowBeta: 'Low beta', highBeta: 'High beta', lowGamma: 'Low gamma', midGamma: 'Mid gamma' };

function useSensor() {
  const capture = useRef(createCapture());
  const live = useRef({ state: { state: 'connecting' }, stats: {}, transport: 'connecting', rate: 0 });
  const [view, setView] = useState({ ...live.current, events: [], packets: [], raw16: [], raw8: [], now: Date.now(), evicted: 0 });
  const pauseRef = useRef(false);
  const [paused, setPaused] = useState(false);
  const [options, setOptions] = useState({ ports: [], bauds: [9600, 19200, 38400, 57600, 115200] });
  const [error, setError] = useState('');
  const rateHistory = useRef([]);
  async function refreshPorts() {
    try {
      const res = await fetch('/api/eeg/status');
      if (!res.ok) throw new Error('无法读取本地串口服务');
      const data = await res.json();
      setOptions({ ports: data.ports, bauds: data.bauds });
      return data;
    } catch (error) { setError(error.message); }
  }
  useEffect(() => {
    let alive = true;
    refreshPorts();
    const source = new EventSource('/api/eeg/events');
    const handle = event => {
      if (!alive) return;
      const data = JSON.parse(event.data);
      if (event.type === 'snapshot') {
        // A new server session has its own packet IDs and counters.
        if (live.current.stats.startedAt && data.stats.startedAt !== live.current.stats.startedAt) {
          capture.current = createCapture(); rateHistory.current = [];
        }
        live.current.state = data.state; live.current.bridge = data.bridge;
      }
      live.current.transport = 'open';
      live.current.stats = data.stats;
      appendEvents(capture.current, data.events);
      const now = Date.now();
      rateHistory.current.push({ at: now, bytes: data.stats.bytes });
      rateHistory.current = rateHistory.current.filter(p => now - p.at <= 5000);
      const first = rateHistory.current[0];
      live.current.rate = now > first.at ? Math.round((data.stats.bytes - first.bytes) / ((now - first.at) / 1000)) : 0;
    };
    source.addEventListener('snapshot', handle);
    source.addEventListener('update', handle);
    source.addEventListener('bridge', event => { live.current.bridge = JSON.parse(event.data); });
    source.addEventListener('status', event => { live.current.state = JSON.parse(event.data); });
    source.onopen = () => { live.current.transport = 'open'; setError(''); };
    source.onerror = () => { live.current.transport = 'error'; };
    const timer = setInterval(() => {
      if (pauseRef.current) return;
      const c = capture.current;
      setView({ ...live.current, events: c.events.slice(-160), packets: c.packets.slice(-160),
        raw16: c.raw16.slice(-1024), raw8: c.raw8.slice(-1024), now: Date.now(), evicted: c.evicted });
    }, 200);
    return () => { alive = false; source.close(); clearInterval(timer); };
  }, []);
  function togglePause() { pauseRef.current = !pauseRef.current; setPaused(pauseRef.current); }
  function clear() {
    capture.current = clearCapture(capture.current);
    setView(v => ({ ...v, events: [], packets: [], raw16: [], raw8: [], evicted: 0 }));
  }
  async function command(action, body) {
    setError('');
    try {
      const res = await fetch(`/api/eeg/${action}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '操作失败');
      return true;
    } catch (error) { setError(error.message); }
  }
  return { view, capture, paused, togglePause, clear, options, refreshPorts, command, error };
}

function RawChart({ samples, bits, paused }) {
  const canvas = useRef(null);
  useEffect(() => {
    const el = canvas.current;
    function draw() {
      const rect = el.getBoundingClientRect(), dpr = Math.min(devicePixelRatio || 1, 2);
      el.width = rect.width * dpr; el.height = rect.height * dpr;
      const ctx = el.getContext('2d'); ctx.scale(dpr, dpr);
      const w = rect.width, h = rect.height;
      ctx.strokeStyle = '#e8ebe4'; ctx.lineWidth = 1;
      for (let i = 0; i <= 4; i++) { const y = 16 + (h - 40) * i / 4; ctx.beginPath(); ctx.moveTo(46, y); ctx.lineTo(w - 14, y); ctx.stroke(); }
      for (let i = 0; i <= 10; i++) { const x = 46 + (w - 60) * i / 10; ctx.beginPath(); ctx.moveTo(x, 16); ctx.lineTo(x, h - 24); ctx.stroke(); }
      if (samples.length < 2) return;
      const values = samples.map(s => s.value), max = Math.max(...values), min = Math.min(...values);
      const pad = Math.max(1, (max - min) * .1), lo = min - pad, hi = max + pad;
      ctx.font = '10px ui-monospace, monospace'; ctx.fillStyle = '#818879';
      ctx.fillText(String(Math.round(hi)), 0, 19); ctx.fillText(String(Math.round(lo)), 0, h - 24);
      ctx.strokeStyle = '#738568'; ctx.lineWidth = 1.4; ctx.beginPath();
      values.forEach((v, i) => {
        const x = 46 + i / (values.length - 1) * (w - 60), y = 16 + (hi - v) / (hi - lo) * (h - 40);
        i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      });
      ctx.stroke();
    }
    const observer = new ResizeObserver(draw); observer.observe(el); draw();
    return () => observer.disconnect();
  }, [samples]);
  return <section className="raw-panel">
    <div className="section-heading"><div><span className="eyebrow">02 / WAVEFORM</span><h2>原始脑电采样</h2></div><span className="muted mono">{samples.length ? `${bits}-bit · ${samples.length} samples${paused ? ' · 已暂停' : ''}` : '等待 RAW 字段'}</span></div>
    <div className="chart-wrap"><canvas ref={canvas} role="img" aria-label={samples.length ? `${bits} 位原始脑电采样，按样本顺序绘制` : '暂无原始脑电采样'} />
      {!samples.length && <div className="chart-empty"><Waveform size={28} weight="light" /><strong>尚未收到原始脑电采样</strong><p>收到 0x80（16 位）或 0x06（8 位）后自动显示</p></div>}
    </div>
    <div className="chart-footer"><span>按样本顺序绘制 · 原始整数值 · 未滤波</span><span>频段功率与原始波形分别展示</span></div>
  </section>;
}

function Inspector({ packet }) {
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState('');
  const timer = useRef();
  useEffect(() => () => clearTimeout(timer.current), []);
  async function copy() {
    try {
      await navigator.clipboard.writeText(JSON.stringify(packet, null, 2)); setCopied(true); setCopyError('');
      clearTimeout(timer.current); timer.current = setTimeout(() => setCopied(false), 1600);
    } catch { setCopyError('复制失败，请使用导出功能'); }
  }
  return <aside className="inspector">
    <div className="inspector-title"><span>数据包详情</span><button className="icon-button" title="复制数据包 JSON" aria-label="复制数据包 JSON" disabled={!packet} onClick={copy}>{copied ? <Check size={16}/> : <Copy size={16}/>}</button></div>
    {!packet ? <div className="inspector-empty"><Terminal size={24}/><p>等待完整数据包</p><span>校验通过后解析字段</span></div> : <>
      <div className="packet-summary"><span className="mono">#{packet.id}</span><span className={packet.checksumValid ? 'tag' : 'tag neutral'}>{packet.checksumValid ? '校验通过' : '校验失败'}</span></div>
      <dl className="packet-meta"><div><dt>接收时间</dt><dd>{time(packet.timestamp)}</dd></div><div><dt>长度</dt><dd>{packet.length} B / 载荷 {packet.payloadLength} B</dd></div><div><dt>校验码 / 期望</dt><dd>{packet.checksumReceived.toString(16).padStart(2, '0').toUpperCase()} / {packet.checksumExpected.toString(16).padStart(2, '0').toUpperCase()}</dd></div></dl>
      {packet.decodeError && <p className="small-message">载荷解析失败：{packet.decodeError}</p>}
      {!packet.checksumValid && <p className="small-message">保留原始包，仅展示校验信息。</p>}
      <div className="fields">{(packet.fields || []).map((f, i) => <div className="field" key={i}>
        <div className="field-label"><code>{f.code}</code><span>{f.name || `未知字段 · EX ${f.level}`}</span></div>
        {typeof f.value === 'object' ? <dl className="band-values">{Object.entries(f.value).map(([key, value]) => <div key={key}><dt>{bandNames[key] || key}</dt><dd>{num(value)}</dd></div>)}</dl> : <div className="field-value"><strong>{f.value ?? '—'}</strong><code>{f.hex}</code></div>}
      </div>)}</div>
    </>}
    <span className="sr-only" aria-live="polite">{copied ? '已复制' : copyError}</span>
  </aside>;
}

function App() {
  const sensor = useSensor(), { view, paused, options } = sensor;
  const [port, setPort] = useState(''), [baud, setBaud] = useState(9600);
  const [mode, setMode] = useState('bytes'), [selected, setSelected] = useState(null);
  const [format, setFormat] = useState('bin'), [notice, setNotice] = useState('');
  const { state, stats } = view;
  const lastAge = stats.lastByteAt == null ? null : Math.max(0, (view.now - stats.lastByteAt) / 1000);
  const fresh = view.transport === 'open' && state.state === 'connected' && lastAge != null && lastAge < 3;
  const signalFresh = fresh && view.now - (stats.valueTimes?.poorSignal || 0) < 3000;
  const quality = stats.values?.poorSignal;
  const busy = ['connected', 'connecting', 'disconnecting'].includes(state.state);
  const statusLabel = view.transport === 'error' ? '服务连接中断' : state.state === 'error' ? '设备连接异常' : state.state === 'disconnected' ? '串口已断开' : state.state === 'disconnecting' ? '正在断开' : fresh ? '正在接收' : state.state === 'connected' ? '等待设备数据' : '正在连接';
  useEffect(() => { if (state.port) setPort(state.port); if (state.baud) setBaud(state.baud); }, [state.port, state.baud]);
  useEffect(() => { if (!port && options.ports.length) setPort(options.ports[0]); }, [options.ports, port]);
  const packets = view.packets, packet = selected || packets.at(-1);
  const rows = mode === 'packets' ? packets : view.events;
  const raw16 = view.raw16, raw8 = view.raw8;
  function download() {
    const events = sensor.capture.current.events;
    if (!events.length) { setNotice('还没有可导出的数据'); return; }
    const binary = format === 'bin';
    const blob = new Blob([binary ? rawBytes(events) : events.map(event => JSON.stringify(event)).join('\n') + '\n'], { type: binary ? 'application/octet-stream' : 'application/x-ndjson' });
    const url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = `eeg-${new Date().toISOString().replace(/[:.]/g, '-')}.${binary ? 'bin' : 'jsonl'}`;
    a.click(); setTimeout(() => URL.revokeObjectURL(url), 30000);
    setNotice(`已导出缓冲区内 ${events.length} 个接收块${paused ? '（包含暂停显示期间的数据）' : ''}`);
  }
  const clear = () => { sensor.clear(); setSelected(null); setNotice('本页缓冲区已清空，接收计数继续累计'); };
  return <div className="eeg-app min-h-[100dvh]">
    <header className="topbar"><a className="brand" href="/" aria-label="EEG Studio 首页"><span className="brand-mark"><Waveform size={23} weight="bold"/></span><span>EEG<span className="brand-light">studio</span></span></a><span className="topbar-caption">SENSOR WORKSPACE</span><div className="local-label"><span className="tiny-dot"/> 原始数据仅在此 Mac</div></header>
    <main className="workspace max-w-[1400px] mx-auto">
      <div className="page-heading"><div><span className="eyebrow">LIVE SERIAL MONITOR</span><h1>看见每一个数据包<span className="title-period">.</span></h1><p>实时读取脑电传感器，保留未经处理的串口字节。</p></div><div className="session-label"><span>接收会话</span><strong>{stats.startedAt ? new Date(stats.startedAt).toLocaleTimeString('en-GB') : '—'}</strong></div></div>
      <div className="dashboard-grid">
        <aside className="device-sidebar">
          <section className="connection-section"><div className="sidebar-heading"><Plug size={19}/><h2>设备连接</h2><button className="icon-button" aria-label="刷新串口列表" title="刷新串口列表" onClick={sensor.refreshPorts}><ArrowClockwise size={16}/></button></div>
            <div className={`connection-state ${fresh ? 'active' : ''}`} role="status" aria-live="polite"><span className="tiny-dot"/>{statusLabel}</div>
            <label htmlFor="serial-port">串口设备</label><select id="serial-port" value={port} onChange={e => setPort(e.target.value)} disabled={busy}><option value="">选择 USB 串口</option>{[...new Set([...options.ports, ...(port ? [port] : [])])].map(p => <option value={p} key={p}>{p}</option>)}</select>
            <label htmlFor="serial-baud">波特率</label><select id="serial-baud" value={baud} onChange={e => setBaud(Number(e.target.value))} disabled={busy}>{options.bauds.map(b => <option value={b} key={b}>{b.toLocaleString('en-US')} baud</option>)}</select>
            <button className="connection-button" disabled={state.state === 'disconnecting'} onClick={() => busy ? sensor.command('disconnect') : sensor.command('connect', { port, baud })}>{busy ? '断开串口' : '连接设备'}</button>
            {(sensor.error || state.state === 'error') && <p className="error-message" role="alert">{sensor.error || state.message}</p>}
            <p className="connection-note">USB 串口接收 · 8N1<br/>断线后自动尝试重新连接</p>
          </section>
          <ForwardPanel bridge={view.bridge} command={sensor.command}/>
          <section className="signal-section"><div className="eyebrow">ELECTRODE CONTACT</div><div className="signal-number"><strong>{quality ?? '—'}</strong><span>POOR_SIGNAL</span></div><div className="signal-scale"><span style={{ transform: `scaleX(${quality == null ? 0 : Math.min(quality, 200) / 200})` }}/></div><div className="scale-labels"><span>0 接触良好</span><span>200 未接触</span></div><p className="contact-status">{signalFresh ? qualityLabel(quality) : quality == null ? '等待信号字段' : '历史读数 · 等待更新'}</p><p className="subtle">数值直接来自设备，值越低信号越好。</p>
            <div className="esense"><div><span>专注度</span><strong>{stats.values?.attention ?? '—'}</strong></div><div><span>放松度</span><strong>{stats.values?.meditation ?? '—'}</strong></div></div><p className="subtle">{!signalFresh || quality !== 0 ? '当前读数暂不可用于判断状态。' : '设备输出的 eSense 指标；0 表示无有效值。'}</p>
          </section>
          <div className="sidebar-foot"><span className="protocol-pill">ThinkGear</span><p>时间戳为本机接收时间。<br/>原始数据在内存中临时保留。</p><a href="https://developer.neurosky.com/docs/doku.php?id=thinkgear_communications_protocol" target="_blank" rel="noreferrer">查看协议说明 ↗</a></div>
        </aside>
        <div className="monitor-main">
          <section className="metrics" aria-label="接收统计"><div><span>已接收</span><strong data-testid="received-bytes">{num(stats.bytes)}<small>bytes</small></strong></div><div><span>有效数据包</span><strong data-testid="valid-packets">{num(stats.validPackets)}<small>packets</small></strong></div><div><span>接收速率</span><strong>{fresh ? view.rate : 0}<small>B/s</small></strong></div><div><span>校验失败</span><strong>{num(stats.badChecksums)}<small>packets</small></strong></div></section>
          <section className="stream-panel"><div className="section-heading"><div><span className="eyebrow">01 / DATA STREAM</span><h2>实时数据流 <span className={`live-pill ${paused || !fresh ? 'idle' : ''}`}>{paused ? 'PAUSED' : fresh ? 'LIVE' : 'WAITING'}</span></h2></div><div className="stream-actions"><button className="text-button" onClick={sensor.togglePause}>{paused ? <Play size={16}/> : <Pause size={16}/>}<span>{paused ? '继续显示' : '暂停显示'}</span></button><button className="icon-button" title="清空本页缓冲区" aria-label="清空本页缓冲区" onClick={clear}><Trash size={17}/></button></div></div>
            <div className="stream-tools"><div className="view-tabs" aria-label="数据视图"><button aria-pressed={mode === 'bytes'} onClick={() => setMode('bytes')}>原始字节 <span>HEX</span></button><button aria-pressed={mode === 'packets'} onClick={() => setMode('packets')}>完整数据包</button></div><span className="stream-hint">{paused ? '显示已暂停，后台继续接收' : '最新数据在顶部'}</span></div>
            <div className="console-grid"><div className="hex-console"><div className="console-header"><span>接收时间</span><span>HEX BYTES</span><span>长度</span></div><div className="console-rows" data-testid="data-log" role="log" aria-live="off" tabIndex="0" aria-label="原始接收数据">
              {!rows.length ? <div className="console-empty"><Terminal size={30} weight="light"/><strong>{view.transport === 'error' ? '本地服务暂时不可用' : '等待串口数据'}</strong><p>{view.transport === 'error' ? '服务恢复后页面会自动重新连接' : '设备发送数据后，原始字节会显示在这里'}</p>{view.transport === 'connecting' && <div className="loading-lines"><i/><i/><i/></div>}</div> : [...rows].reverse().map(row => {
                const content = <><time>{time(row.timestamp)}</time><code>{row.hex.split(' ').map((byte, i) => <span key={i} className={mode === 'packets' && i < 2 ? 'byte-sync' : mode === 'packets' && i === 2 ? 'byte-length' : mode === 'packets' && i === row.length - 1 ? 'byte-checksum' : ''}>{byte} </span>)}</code><span className="byte-count">{row.length} B{mode === 'packets' && !row.checksumValid ? ' !' : ''}</span></>;
                return mode === 'packets' ? <button className={`hex-row ${selected?.id === row.id ? 'selected' : ''}`} key={row.id} onClick={() => setSelected(row)} aria-label={`查看数据包 ${row.id}`}>{content}</button> : <div className="hex-row" key={row.id}>{content}</div>;
              })}
            </div><div className="console-footer"><span>{mode === 'bytes' ? '完整保留收到的字节，包括不完整包与噪声' : 'SYNC · 长度 · 载荷 · 校验码'}</span><span>{rows.length} 条</span></div></div><Inspector packet={packet}/></div>
            <div className="stream-bottom"><span>{selected ? <button className="follow-button" onClick={() => setSelected(null)}>返回最新数据包 ↗</button> : '详情跟随最新数据包'}{stats.decodeErrors ? ` · ${stats.decodeErrors} 个载荷解析失败` : ''}</span><span>最近接收 {lastAge == null ? '—' : `${lastAge.toFixed(1)} s 前`}</span></div>
          </section>
          <RawChart samples={raw16.length ? raw16 : raw8} bits={raw16.length ? 16 : 8} paused={paused}/>
          <div className="export-row"><div><strong>保留这段数据</strong><p>导出本页缓冲区；最多 {MAX_EVENTS.toLocaleString()} 个接收块 / 8 MB。{view.evicted > 0 ? `已移出 ${view.evicted} 个较早接收块。` : ''}</p></div><div className="export-controls"><label className="sr-only" htmlFor="export-format">导出格式</label><select id="export-format" value={format} onChange={e => setFormat(e.target.value)}><option value="bin">原始字节 .bin</option><option value="jsonl">字节与解析 .jsonl</option></select><button className="export-button" onClick={download}><DownloadSimple size={17}/>导出数据</button></div></div>
          <p className="notice" role="status" aria-live="polite">{notice}</p>
        </div>
      </div>
      <footer className="page-footer"><span>EEG STUDIO / LOCAL MONITOR</span><span>真实数据 · 无模拟信号</span></footer>
    </main>
  </div>;
}

createRoot(document.getElementById('root')).render(<App/>);
