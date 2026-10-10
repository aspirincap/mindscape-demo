import React, { useCallback, useEffect, useRef, useState, memo } from 'react';
import { createRoot } from 'react-dom/client';
import { ArrowUpRight } from '@phosphor-icons/react/dist/csr/ArrowUpRight';
import { ArrowRight } from '@phosphor-icons/react/dist/csr/ArrowRight';
import { Waveform } from '@phosphor-icons/react/dist/csr/Waveform';
import { Waves } from '@phosphor-icons/react/dist/csr/Waves';
import { Tree } from '@phosphor-icons/react/dist/csr/Tree';
import { SpeakerHigh } from '@phosphor-icons/react/dist/csr/SpeakerHigh';
import { SpeakerSlash } from '@phosphor-icons/react/dist/csr/SpeakerSlash';
import { ArrowsOut } from '@phosphor-icons/react/dist/csr/ArrowsOut';
import { ArrowsIn } from '@phosphor-icons/react/dist/csr/ArrowsIn';
import { Play } from '@phosphor-icons/react/dist/csr/Play';
import { Pause } from '@phosphor-icons/react/dist/csr/Pause';
import { ArrowCounterClockwise } from '@phosphor-icons/react/dist/csr/ArrowCounterClockwise';
import { Question } from '@phosphor-icons/react/dist/csr/Question';
import { Microphone } from '@phosphor-icons/react/dist/csr/Microphone';
import { X } from '@phosphor-icons/react/dist/csr/X';
import { Check } from '@phosphor-icons/react/dist/csr/Check';
import { SlidersHorizontal } from '@phosphor-icons/react/dist/csr/SlidersHorizontal';
import { Broadcast } from '@phosphor-icons/react/dist/csr/Broadcast';
import { CircleNotch } from '@phosphor-icons/react/dist/csr/CircleNotch';
import { Heart } from '@phosphor-icons/react/dist/csr/Heart';
import { Leaf } from '@phosphor-icons/react/dist/csr/Leaf';
import { Crosshair } from '@phosphor-icons/react/dist/csr/Crosshair';
import { Circle } from '@phosphor-icons/react/dist/csr/Circle';
import { DEFAULT_FRAME, SignalProcessor, demoFrame, chooseWorld } from './core/state.mjs';
import { useEEG } from './useEEG';
import { EEGPanel } from './EEGPanel';
import { AudioEngine } from './audio';
import './styles.css';
import { GlobeExperience } from './GlobeExperience';
import { LOCATIONS, locationById, locationForWorld } from './core/locations.mjs';
import { GlobeHemisphereEast } from '@phosphor-icons/react/dist/csr/GlobeHemisphereEast';
import { GestureControls } from './GestureControls';
import { VisualControls } from './VisualControls';
import { GeoControls } from './GeoControls';
import { GEO_WORLDS } from './core/geo-navigation.mjs';


const WORLDS = Object.fromEntries(LOCATIONS.map((l,i) => [l.worldId, { number: String(i+1).padStart(2,'0'), name:l.name, en:l.english, title:[l.name,l.title], subtitle:l.description, intention:l.theme.join(' · '), icon:GlobeHemisphereEast }]));
const INITIAL_LIVE = { ...DEFAULT_FRAME, coherence: DEFAULT_FRAME.relaxation, tension: 1 - DEFAULT_FRAME.relaxation };
const fmt = value => value == null ? '—' : Math.round(value * 100);

const Scene = memo(function Scene({ engine, world, onStats, onError, onReady, density }) {
  const container = useRef();
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let cancelled=false, renderer;
    setReady(false);onReady(false);
    const module=GEO_WORLDS.has(world)?import('./geo-renderer'):import('./renderer');
    module.then(async ({WorldRenderer})=>{
      if(cancelled)return;
      renderer=new WorldRenderer(container.current,onStats,onError);engine.current=renderer;
      renderer.setDensity(density);
      await renderer.loadWorld(world);
      if(!cancelled){setReady(true);onReady(true);}
    }).catch(error=>{if(!cancelled)onError(error.message||'场景加载失败，请重试。');});
    return ()=>{cancelled=true;renderer?.dispose();if(engine.current===renderer)engine.current=null;};
  }, [world]);
  useEffect(() => { engine.current?.setDensity(density); }, [density, ready]);
  return <div className="scene" ref={container} />;
});

function Trace({ history, compact = false }) {
  const path = history.map((n, i) => `${i / Math.max(1, history.length - 1) * 280},${48 - n * 38}`).join(' ');
  return <svg className={compact ? 'trace compact' : 'trace'} viewBox="0 0 280 56" preserveAspectRatio="none" aria-label="最近 30 秒放松度趋势" role="img">
    <defs><linearGradient id="trace-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="currentColor" stopOpacity=".14"/><stop offset="100%" stopColor="currentColor" stopOpacity="0"/></linearGradient></defs>
    <path d="M0 14H280 M0 32H280 M0 50H280" stroke="currentColor" strokeOpacity=".08" fill="none"/>
    {history.length > 1 && <><polygon points={`0,56 ${path} 280,56`} fill="url(#trace-fill)"/><polyline points={path} stroke="currentColor" strokeWidth="1.5" fill="none"/></>}
  </svg>;
}

function App() {
  const [world, setWorld] = useState('abyss');
  const [stage, setStage] = useState('connect');
  const [selectedId, setSelectedId] = useState(null);
  const [recommendations, setRecommendations] = useState(() => chooseWorld('', DEFAULT_FRAME));
  const routeSequence = useRef(0);
  const transitionSequence = useRef(0);
  const [frame, setFrame] = useState({ ...DEFAULT_FRAME });
  const [live, setLive] = useState(INITIAL_LIVE);
  const [source, setSource] = useState('simulator');
  const [mode, setMode] = useState('manual');
  const [paused, setPaused] = useState(false);
  const [audio, setAudio] = useState(false);
  const [immersive, setImmersive] = useState(false);
  const [help, setHelp] = useState(false);
  const [controls, setControls] = useState(false);
  const controlsDialog = useRef(null);
  const [quality, setQuality] = useState(1);
  const [feedbackEnabled, setFeedbackEnabled] = useState(false);
  const [volume, setVolume] = useState(.5);
  const eeg = useEEG({ source, paused, enabled: feedbackEnabled });
  const session = eeg.session;
  const backend = eeg.transport.backend;
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [stats, setStats] = useState({ fps: 0, points: 0 });
  const [elapsed, setElapsed] = useState(0);
  const [demoElapsed, setDemoElapsed] = useState(0);
  const [history, setHistory] = useState([]);
  const [intent, setIntent] = useState('');
  const [routing, setRouting] = useState(false);
  const [listening, setListening] = useState(false);
  const [guide, setGuide] = useState('每一次呼吸，都让世界更完整一点。');
  const engine = useRef(null);
  const processor = useRef(new SignalProcessor());
  const audioEngine = useRef(new AudioEngine());
  const speech = useRef(null);
  const clock = useRef({ elapsed: 0, demo: 0, calibration: -1 });
  const settings = useRef({});
  settings.current = { frame, source, mode, paused, audio, world, stage, selectedId, feedbackEnabled, volume };
  const dialog = useRef();
  const currentWorld = WORLDS[world];

  useEffect(() => {
    let raf, previous = performance.now(), lastUI = 0, lastHistory = 0;
    const tick = now => {
      const dt = Math.min((now - previous) / 1000, 0.1); previous = now;
      const config = settings.current, time = clock.current;
      if (!config.paused && !document.hidden) time.elapsed += dt;
      let input = config.frame;
      if (config.mode === 'demo') {
        if (!config.paused && !document.hidden) time.demo += dt;
        if (config.source === 'simulator') input = demoFrame(time.demo);
        if (time.demo >= 60) { setMode('manual'); if (config.source === 'simulator') setFrame(demoFrame(60)); setToast('60 秒呼吸引导已完成。'); }
      }
      const device = eeg.processor.current;
      const value = config.source === 'device'
        ? device.tick(now, { connected: eeg.transportRef.current.connected && eeg.transportRef.current.bridge && eeg.transportRef.current.serial === 'connected', paused: config.paused, hidden: document.hidden, enabled: config.feedbackEnabled })
        : config.paused || document.hidden ? processor.current.value : processor.current.update(input, dt);
      if (engine.current) { engine.current.state = value; engine.current.active = !config.paused; }
      if (now - lastUI > 125) {
        setLive({ ...value }); setElapsed(time.elapsed); setDemoElapsed(time.demo);
        audioEngine.current.update(value, config.world, config.audio && !config.paused, config.volume);
        lastUI = now;
      }
      if (config.source === 'simulator' && now - lastHistory > 500 && !config.paused && !document.hidden) {
        setHistory(h => [...h.slice(-59), value.coherence]); lastHistory = now;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); audioEngine.current.dispose(); speech.current?.abort(); };
  }, []);

  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(''), 4200); return () => clearTimeout(t); }, [toast]);
  useEffect(() => { if (controls) controlsDialog.current?.showModal(); else controlsDialog.current?.close(); }, [controls]);
  useEffect(() => { if (help) dialog.current?.showModal(); else dialog.current?.close(); }, [help]);
  useEffect(() => {
    const handler = event => {
      if (event.key === 'Escape') { setImmersive(false); if (settings.current.stage === 'enter') { transitionSequence.current++; engine.current?.cancelFlight?.(); setStage('explore'); } return; }
      if (['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(event.target.tagName) || dialog.current?.open || controlsDialog.current?.open) return;
      if (event.code === 'Space') { event.preventDefault(); setPaused(v => !v); }
      if (event.key.toLowerCase() === 'f' && settings.current.stage === 'transform') setImmersive(v => !v);
    };
    window.addEventListener('keydown', handler); return () => window.removeEventListener('keydown', handler);
  }, []);
  useEffect(() => {
    if (import.meta.env.DEV) window.__mindscape = { getState: () => ({ world: settings.current.world, stage: settings.current.stage, selectedId: settings.current.selectedId, renderer: engine.current?.kind, orientation: engine.current?.globe?.quaternion.toArray(), ready: engine.current?.ready, source: settings.current.source, state: { ...(settings.current.source === 'device' ? eeg.processor.current.value : processor.current.value) }, points: engine.current?.count, audio: audioEngine.current.context?.state }) };
    return () => { delete window.__mindscape; };
  }, []);

  async function copyPairing() {
    try { await eeg.copyPairing(); setToast('配对配置已复制，请粘贴到本地 EEG Studio。'); }
    catch (e) { setToast(e.message || '复制失败'); }
  }
  function switchSource(next) {
    if (source === next) return;
    eeg.processor.current.reset(); processor.current = new SignalProcessor();
    setSource(next); setMode('manual'); setHistory([]); setFeedbackEnabled(false);
    setLive(next === 'device' ? eeg.processor.current.value : INITIAL_LIVE);
  }
  function setValue(key, value) { setMode('manual'); setFrame(v => ({ ...v, [key]: value })); }
  function preset(relaxation, HR) { switchSource('simulator'); setMode('manual'); setFrame(v => ({ ...v, relaxation, HR, signalQuality: 0.98 })); setPaused(false); }
  function runDemo() {
    if (mode === 'demo') { setMode('manual'); if (source === 'simulator') setFrame(demoFrame(clock.current.demo)); return; }
    clock.current.demo = 0; setDemoElapsed(0); setMode('demo'); setPaused(false);
    setGuide(source === 'device' ? '60 秒呼吸引导 · 保持真实设备数据，未测量呼吸。' : '跟随 60 秒引导，见证世界从破碎到完整。');
  }
  function calibrate() {
    if (!eeg.processor.current.beginCalibration()) setToast('请等待专注与冥想各连续 3 个有效新读数，再开始校准。');
  }
  async function toggleAudio() {
    try { if (!audio) await audioEngine.current.start(); setAudio(v => !v); }
    catch (e) { setToast(e.message || '音频启动失败，请再试一次。'); }
  }
  function navigateStage(next, locationId = null) {
    routeSequence.current++; transitionSequence.current++;
    setRouting(false); engine.current?.cancelFlight?.();
    if (mode === 'demo') setFrame(demoFrame(clock.current.demo));
    setControls(false); setMode('manual'); setImmersive(false); setStage(next); setStats({ fps: 0, points: 0 });
    if (locationId) setSelectedId(locationId);
  }
  function selectLocation(id) {
    if (!locationById(id) || stage === 'enter') return;
    routeSequence.current++; setRouting(false);
    setSelectedId(id); engine.current?.focus?.(id);
  }
  async function enterLocation(id) {
    const location = locationById(id);
    if (!location || engine.current?.kind !== 'globe' || !engine.current.ready || engine.current.flight || settings.current.stage === 'enter') return;
    const sequence = ++transitionSequence.current;
    setSelectedId(id); setStage('enter'); setImmersive(false); setPaused(false);
    const arrived = await engine.current.flyTo(id);
    if (!arrived || sequence !== transitionSequence.current) return;
    setWorld(location.worldId); setGuide(location.description); setLoaded(false);
    setStats({ fps: 0, points: 0 }); setError(''); setStage('transform');
  }
  function cancelEntry() { transitionSequence.current++; engine.current?.cancelFlight?.(); setStage('explore'); }
  function advanceJourney() {
    setControls(false);
    if (stage === 'connect') navigateStage('speak');
    else if (stage === 'speak') intent.trim() ? route() : navigateStage('explore');
    else if (stage === 'explore') selectedId ? enterLocation(selectedId) : selectLocation(recommendations.recommendedWorlds[0].locationId);
    else if (stage === 'transform') runDemo();
  }
  async function route(event) {
    event?.preventDefault();
    if (!intent.trim()) { setToast('描述一个想去的地方，或此刻的心情。'); return; }
    const sequence = ++routeSequence.current;
    setRouting(true);
    let result;
    try {
      await session.current;
      const response = await fetch('/api/route', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: intent }), signal: AbortSignal.timeout(15000) });
      if (!response.ok) throw new Error('推荐服务暂不可用');
      result = await response.json();
      if (result.fallback && sequence === routeSequence.current) setToast(result.fallback === 'rate-limited' ? 'AI 推荐额度暂时用完，已使用本地规则。' : 'AI 暂不可用，已使用本地规则。');
      if (!Array.isArray(result.recommendedWorlds) || result.recommendedWorlds.length !== LOCATIONS.length || result.recommendedWorlds.some(r => !locationById(r.locationId))) throw new Error('推荐列表需要更新');
    } catch {
      result = chooseWorld(intent, live);
      if (sequence === routeSequence.current) setToast('已使用浏览器本地规则生成推荐。');
    }
    if (sequence !== routeSequence.current) return;
    if (mode === 'demo') setFrame(demoFrame(clock.current.demo));
    setMode('manual'); setImmersive(false); setRouting(false);
    setControls(false); setRecommendations(result); setSelectedId(null); setGuide(result.reason); setStage('explore');
    engine.current?.resetCamera();
  }
  function voice() {
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) { setToast('当前浏览器不支持语音识别，请使用文字输入。'); return; }
    if (listening) { speech.current?.stop(); return; }
    const rec = new Recognition(); speech.current = rec; rec.lang = 'zh-CN'; rec.interimResults = false;
    rec.onresult = e => { setIntent(e.results[0][0].transcript); setToast('语音已转为文字，确认心情后查看目的地推荐。'); };
    rec.onerror = () => { setListening(false); setToast('语音未能识别，请检查麦克风权限或使用文字。'); };
    rec.onend = () => setListening(false);
    try { rec.start(); setListening(true); } catch { setToast('无法启动麦克风，请使用文字输入。'); }
  }
  const statsHandler = useCallback(value => setStats(value), []);
  const errorHandler = useCallback(value => setError(value), []);
  const readyHandler = useCallback(value => { setLoaded(value); if (value) setError(''); }, []);
  const breathTime = elapsed % 10;
  const inhaling = breathTime < 4;
  const breathProgress = inhaling ? breathTime / 4 : 1 - (breathTime - 4) / 6;
  const currentInput = mode === 'demo' ? demoFrame(demoElapsed) : frame;
  const status = source === 'device' ? live.status || '等待设备' : live.signalQuality < 0.4 ? '信号待恢复' : live.coherence < 0.35 ? '正在漂散' : live.coherence < 0.7 ? '正在归位' : '渐入宁静';
  const journey = mode === 'demo' ? demoElapsed < 12 ? '01 / 释放纷乱' : demoElapsed < 45 ? '02 / 慢慢归位' : '03 / 安住此刻' : '自由探索';
  const stages = ['connect', 'speak', 'explore', 'enter', 'transform'];
  const stageNames = ['连接', '心意', '探索', '抵达', '共鸣'];
  const stageIndex = stages.indexOf(stage);
  return <div className={`app world-${world} view-${stage} ${immersive ? 'immersive' : ''}`}>
    <header className="topbar flex items-center justify-between">
      <a className="brand" href="/" aria-label="Mindscape 意境首页"><span className="brand-orbit"><i/><i/><i/></span><span>mindscape<span className="brand-divider"/>意境</span></a>
      <nav className="journey-nav" aria-label="体验阶段">{stages.map((step, index) => <button key={step} className={stage === step ? 'active' : index < stageIndex ? 'complete' : ''} aria-current={stage === step ? 'step' : undefined} disabled={index >= stageIndex || step === 'enter' || stage === 'enter'} onClick={() => navigateStage(step)}><span>{String(index + 1).padStart(2, '0')}</span>{stageNames[index]}</button>)}</nav>
      <div className="top-right"><button className="text-button" onClick={() => setControls(true)}><SlidersHorizontal size={16}/>调节共鸣</button><span className="local-status"><i/> {backend === 'cloudflare' ? '云端体验' : '本地体验'} <span className="local-label">{backend === 'cloudflare' ? 'CLOUDFLARE' : 'LOCAL DEMO'}</span></span><button className="icon-button" aria-label="使用说明" onClick={() => setHelp(true)}><Question size={19}/></button></div>
    </header>

    <main>
      <section className="experience" aria-label="沉浸世界">
        {stage !== 'transform' ? <GlobeExperience cloud={backend === 'cloudflare'} engine={engine} stage={stage} selectedId={selectedId} recommendations={recommendations} live={live} source={source} intent={intent} setIntent={setIntent} routing={routing} listening={listening} voice={voice} onRoute={route} onStage={navigateStage} onSelect={selectLocation} onEnter={enterLocation} onCancel={cancelEntry} onStats={statsHandler} stats={stats} density={quality}/> : <>
        <Scene engine={engine} world={world} onStats={statsHandler} onError={errorHandler} onReady={readyHandler} density={quality}/>
        <div className="scene-vignette"/>
        <div className="world-intro" key={world}>
          <div className="eyebrow"><span className="short-line"/> WORLD {currentWorld.number} <span>/</span> {currentWorld.en}</div>
          <h1>{currentWorld.name}</h1>
          <p>{currentWorld.subtitle}</p>
          <div className="world-tag"><currentWorld.icon size={14}/>{currentWorld.intention}<span>·</span> {GEO_WORLDS.has(world)?'真实地理 · 自由探索':'主题点云 · 非实地扫描'}</div>
        </div>
        <div className="scene-tools">
          <button className="back-to-globe" onClick={() => navigateStage('explore', locationForWorld(world).id)}><GlobeHemisphereEast size={16}/> 返回地球</button>
          <button className={`icon-button glass ${audio ? 'selected' : ''}`} aria-label={audio ? '关闭环境音' : '开启环境音'} aria-pressed={audio} title={audio ? '关闭环境音' : '开启环境音'} onClick={toggleAudio}>{audio ? <SpeakerHigh size={18}/> : <SpeakerSlash size={18}/>}</button>
          <button className="icon-button glass" aria-label="重置视角" title="重置视角" onClick={() => engine.current?.resetCamera()}><ArrowCounterClockwise size={18}/></button>
          <button className="icon-button glass" aria-label={immersive ? '退出沉浸模式' : '进入沉浸模式'} title="沉浸模式 (F)" onClick={() => setImmersive(v => !v)}>{immersive ? <ArrowsIn size={18}/> : <ArrowsOut size={18}/>}</button>
        </div>
        <GeoControls engine={engine} ready={loaded} world={world} stats={stats.geo}/>
        <VisualControls engine={engine} ready={loaded} world={world}/>
        <GestureControls engine={engine} paused={paused} world={world} ready={loaded}/>
        {!loaded && !error && <div className="scene-message"><CircleNotch className="spin" size={27}/><span>正在构建{currentWorld.name}…</span><small>让每一个微粒找到自己的位置</small></div>}
        {error && <div className="scene-message error" role="alert"><span>{error}</span><button className="primary" onClick={() => location.reload()}>重新加载</button></div>}
        <div className="world-caption"><i/><span>{status}</span><span className="caption-rule"/><span>{guide}</span></div>
        <div className="breathing" aria-label="呼吸引导：吸气四秒，呼气六秒">
          <div className="breath-symbol"><div className="breath-ring" style={{ transform: `scale(${0.72 + breathProgress * 0.28})` }}/><div className="breath-inner"/><span>{paused ? <Pause size={15}/> : <Waves size={17}/>}</span></div>
          <div><strong>{paused ? '停留片刻' : inhaling ? '慢慢吸气' : '缓缓呼气'}<span>{paused ? 'PAUSED' : inhaling ? 'BREATHE IN' : 'BREATHE OUT'}</span></strong><p>{paused ? '准备好后，继续这段旅程' : '吸气 4 秒，呼气 6 秒。不必用力。'}</p></div>
          <span className="breath-count">{paused ? '—' : Math.ceil(inhaling ? 4 - breathTime : 10 - breathTime).toString().padStart(2, '0')}</span>
        </div>
        <div className="scene-bottom"><span>{GEO_WORLDS.has(world)?'拖动平移 · 右键环绕 · 滚轮缩放':'拖动探索视角 · 滚轮拉近世界'}</span><span>{stats.points ? (stats.points / 1000).toFixed(1) + 'K POINTS' : 'LOADING'}<i/>{stats.fps || '—'} FPS</span></div>
        </>}
      </section>

      <dialog ref={controlsDialog} className="controls-dialog" aria-label="实时状态与模拟器" onCancel={() => setControls(false)} onClick={e => { if(e.target === controlsDialog.current) setControls(false); }}><div className="control-panel"><button className="icon-button close-dialog" aria-label="关闭共鸣面板" onClick={() => setControls(false)}><X size={20}/></button>
        <div className="panel-heading"><div><Waveform size={18}/><h2>氛围与设备</h2></div><span className="small-tag">LIVE</span></div>
        <div className="source-tabs" role="group" aria-label="数据来源"><button className={source === 'simulator' ? 'active' : ''} aria-pressed={source === 'simulator'} onClick={() => switchSource('simulator')}><SlidersHorizontal size={14}/> 模拟器</button><button className={source === 'device' ? 'active' : ''} aria-pressed={source === 'device'} onClick={() => switchSource('device')}><Broadcast size={14}/> 设备接入</button></div>
        {source === 'device' ? <EEGPanel connection={eeg.transport} live={live} processor={eeg.processor.current} enabled={feedbackEnabled && !eeg.processor.current.autoPaused}
          onToggle={() => { if (eeg.processor.current.autoPaused) { eeg.processor.current.resume(); setFeedbackEnabled(true); } else setFeedbackEnabled(v => !v); }} onCopy={copyPairing} onCalibrate={calibrate}/> : <>
          <div className="signal-line"><span>模拟信号 · 非设备测量</span></div>
          <div className="mini-metrics"><div><span>专注模拟分</span><strong>{fmt(live.attention)}</strong></div><div><span>模拟心率</span><strong>{live.HR == null ? '—' : Math.round(live.HR)}<small>BPM</small></strong></div><div><span>冥想模拟分</span><strong>{fmt(live.relaxation)}</strong></div></div>
          <Trace history={history}/><div className="panel-section simulator-section">
            <div className="presets"><button onClick={() => preset(0.12, 94)}>紧绷</button><button onClick={() => preset(0.52, 78)}>舒缓</button><button onClick={() => preset(0.96, 62)}>深度平静</button></div>
            {[
              ['relaxation', '放松度', '控制世界聚散', 0, 1, 0.01],
              ['attention', '专注度', '控制光点明亮度', 0, 1, 0.01],
              ['HR', '心率', '控制世界脉动', 40, 140, 1],
              ['signalQuality', '信号质量', '低于 40% 保持画面', 0, 1, 0.01],
            ].map(([key, label, hint, min, max, step]) => <div className="slider-field" key={key}><label htmlFor={key}><span>{label}<small>{hint}</small></span><output>{key === 'HR' ? Math.round(currentInput[key]) : fmt(currentInput[key])}<span>{key === 'HR' ? ' BPM' : '%'}</span></output></label><input id={key} type="range" min={min} max={max} step={step} value={currentInput[key]} onChange={e => setValue(key, Number(e.target.value))} style={{ '--range': `${(currentInput[key] - min) / (max - min) * 100}%` }}/></div>)}
          </div></>}
        <label className="eeg-volume">环境音量<input aria-label="环境音量" type="range" min="0" max="1" step=".01" value={volume} onChange={e => setVolume(Number(e.target.value))}/></label>
        {(stage === 'explore' || stage === 'transform') && <div className="panel-section intention-section"><div className="section-heading"><h3>此刻，你想去哪里？</h3><span>{backend === 'cloudflare' ? 'AI 推荐' : '本地规则'}</span></div><form className="intent-input" onSubmit={route}><label className="sr-only" htmlFor="intent">描述你想去的地方或此刻的心情</label><input id="intent" value={intent} maxLength={500} onChange={e => setIntent(e.target.value)} placeholder="想潜入深海，放空一下…"/><button type="button" className={listening ? 'listening' : ''} onClick={voice} aria-label={listening ? '结束语音输入' : '语音输入'}><Microphone size={16}/></button><button type="submit" disabled={routing} aria-label="选择适合的世界">{routing ? <CircleNotch size={16} className="spin"/> : <ArrowRight size={16}/>}</button></form></div>}
        <div className="panel-actions"><button className="primary demo-button" disabled={stage === 'enter' || routing} onClick={advanceJourney}>{mode === 'demo' ? <Circle size={15} weight="fill"/> : <Play size={14} weight="fill"/>}{stage === 'transform' ? mode === 'demo' ? '结束演示' : '开启 60 秒旅程' : stage === 'connect' ? '继续旅程' : stage === 'speak' ? '查看目的地推荐' : stage === 'enter' ? '正在抵达目的地' : selectedId ? '确认出发' : '选择目的地'}<span>{mode === 'demo' ? `${Math.min(60, Math.floor(demoElapsed)).toString().padStart(2, '0')} / 60` : <ArrowUpRight size={17}/>}</span></button><div className="panel-footnote">{source === 'simulator' ? '模拟数据 · 无需佩戴设备' : '设备数据 · 信号异常自动保持画面'}</div></div>
      </div></dialog>
    </main>

    <footer className="bottom-bar"><span className="brand-motto">YOUR MIND SHAPES THIS WORLD.</span><div className="playback"><button onClick={() => setPaused(v => !v)} aria-label={paused ? '继续体验' : '暂停体验'}>{paused ? <Play size={13} weight="fill"/> : <Pause size={13} weight="fill"/>}</button><span>{Math.floor(elapsed / 60).toString().padStart(2, '0')}:{Math.floor(elapsed % 60).toString().padStart(2, '0')}</span><i/><span>{stage === 'transform' ? journey : stageNames[stageIndex] + ' · 地球入口'}</span>{mode === 'demo' && <div className="demo-progress"><span style={{ transform: `scaleX(${demoElapsed / 60})` }}/></div>}</div><div className="render-quality"><label htmlFor="quality">画质</label><select id="quality" value={quality} onChange={e => setQuality(Number(e.target.value))}><option value={1}>精细</option><option value={0.45}>流畅</option></select><span className="version">V.07.0</span></div></footer>
    <div className="sr-only" role="status" aria-live="polite">{stage === 'transform' ? `${currentWorld.name}。${status}。` : ''}</div>
    {toast && <div className="toast" role="status"><Check size={15}/>{toast}</div>}

    <dialog ref={dialog} className="help-dialog" onCancel={() => setHelp(false)} onClick={e => { if (e.target === dialog.current) setHelp(false); }}><div className="dialog-content"><button className="icon-button close-dialog" aria-label="关闭说明" onClick={() => setHelp(false)}><X size={20}/></button><div className="eyebrow">A WORLD WITHIN YOU</div><h2>用呼吸，让世界归位。</h2><p>从连接与表达心情开始，在三维地球上探索遍布世界的 12 个地点。推荐只提供方向，点击地点并确认后才会飞入世界；随时可返回地球。富士山与大峡谷使用真实地理数据，可平移探索、跳转地标和查看来源；其余地点为原创主题点云。</p><p>进入任意点云场景后，调节模拟器，亲眼看见点云从漂散回到原位。也可以开启 60 秒旅程，跟随吸气 4 秒、呼气 6 秒的节奏。</p><div className="help-mappings"><span>放松度 → 世界聚散</span><span>专注度 → 限幅亮度</span><span>心率（可选）→ 微脉动</span><span>信号不足 → 保持上次状态</span></div><h3>调出你的光影</h3><p>进入场景后，打开「视觉调节」，选择清晰、流光或梦境。可对照原始点云、粒子流动和完整光影，调节粒子尺寸、聚散、光晕与余辉。更多细节中可以改变流动速度和色彩。转动镜头时余辉会收起，让主体保持清楚。</p><h3>用手轻触世界</h3><p>在场景中开启手势并允许摄像头，仅识别一只手。张开手掌或握拳后移动手，镜头跟随移动；拇指食指捏住后，上移持续放大、下移持续缩小；离中点越远速度越快，回到中点暂停，松开立即停止。其余手指自然舒展，再次捏合会以当前位置重新设定中点。切换手型时请稍停片刻。摄像头画面由本机 MediaPipe 处理，不上传。关闭手势或返回地球会释放摄像头。鼠标与触摸可以随时接管；将手移出画面再放回，即可恢复手势。</p><h3>连接自己的设备</h3><p>运行 <code>npm run eeg</code>，在本页「设备接入」复制配置，到本地 EEG Studio 的「连接 Mindscape」粘贴并开始联动。唯一协议为 <code>mindscape.eeg.v2</code>，配置有效期 24 小时。约每秒真实更新一次，不补发历史值。原始字节与频段保留在本地。</p><p>专注与冥想为相对分，0 表示无效；无心率显示未接入。个人校准至少 30 秒及每项 25 个独立样本，最多 60 秒，暂停和隐藏页面不计时。接触不良或字段 2.5 秒未更新时保持对应氛围；离线 10 秒暂停联动。镜头保持手动或单手控制。</p><h3>关于这个 demo</h3><p>富士山山顶使用静冈县实测点云，外围及大峡谷由真实高程构建地形点云，并按视距分层加载；其余 10 个世界为原创程序点云。所有场景均非 3DGS。{backend === 'cloudflare' ? '主题推荐通过 Cloudflare AI Gateway 调用模型，仅发送主动提交的心意文字，不发送脑电或心率指标；不可用时明确回退到本地规则。' : '主题选择使用本地规则，未调用 AI。'}契合分用于体验排序，不是健康评估；语音使用浏览器识别能力，支持情况因浏览器而异。环境音由本地 Web Audio 实时合成。</p><div className="keyboard-help"><span><kbd>Space</kbd> 暂停 / 继续</span><span><kbd>F</kbd> 沉浸模式</span><span><kbd>Esc</kbd> 退出</span></div><button className="primary" onClick={() => setHelp(false)}>开始探索 <ArrowRight size={16}/></button></div></dialog>
  </div>;
}

createRoot(document.getElementById('root')).render(<App/>);
