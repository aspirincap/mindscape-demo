import React, { memo, useEffect, useRef, useState } from 'react';
import { ArrowRight } from '@phosphor-icons/react/dist/csr/ArrowRight';
import { ArrowCounterClockwise } from '@phosphor-icons/react/dist/csr/ArrowCounterClockwise';
import { CircleNotch } from '@phosphor-icons/react/dist/csr/CircleNotch';
import { Microphone } from '@phosphor-icons/react/dist/csr/Microphone';
import { MapPin } from '@phosphor-icons/react/dist/csr/MapPin';
import { GlobeHemisphereEast } from '@phosphor-icons/react/dist/csr/GlobeHemisphereEast';
import { Waves } from '@phosphor-icons/react/dist/csr/Waves';
import { Tree } from '@phosphor-icons/react/dist/csr/Tree';
import { LOCATIONS, locationById, formatCoordinates } from './core/locations.mjs';
import './globe.css';

const HEADLINES = {
  connect: { label:'A WORLD WITHIN YOU', title:['把心，','放回世界。'], copy:'从此刻的呼吸出发。去往山巅、海底，或心里向往的远方。' },
  speak: { label:'FOLLOW YOUR FEELING', title:['此刻，','你想去哪？'], copy:'一句心情，一个向往。让世界给你一点灵感。' },
  explore: { label:'MORE WAYS TO WANDER', title:['下一站，','听从内心。'], copy:'转动地球，或从下方的目的地中选择。' },
  enter: { label:'YOUR JOURNEY BEGINS', title:['世界，','正在靠近。'], copy:'放慢呼吸，我们即将抵达。' },
};

export const GlobeExperience = memo(function GlobeExperience({ cloud, engine, stage, selectedId, recommendations, live, source, intent, setIntent, routing, listening, voice, onRoute, onStage, onSelect, onEnter, onCancel, onStats, stats, density }) {
  const viewport = useRef(), nodes = useRef({}), veil = useRef(), progress = useRef();
  const callbacks = useRef({}); callbacks.current = { onSelect, onStats };
  const [search, setSearch] = useState('');
  const [loaded, setLoaded] = useState(false), [error, setError] = useState(''), [retry, setRetry] = useState(0), [hovered, setHovered] = useState(null);
  const selected = locationById(selectedId), heading = HEADLINES[stage];
  const ranked = recommendations.recommendedWorlds;
  const topId = ranked[0]?.locationId;
  const recommendationLabel = recommendations.mode === 'ai-gateway' ? 'AI 推荐' : recommendations.fallback ? '本地规则 · AI 回退' : '本地规则';
  function hoverMarker(id) { setHovered(id); if (engine.current?.kind === 'globe') engine.current.hovering = !!id; }
  useEffect(() => {
    let cancelled = false, instance;
    setLoaded(false); setError('');
    import('./globe-renderer').then(async ({ GlobeRenderer }) => {
      if (cancelled) return;
      try {
        instance = new GlobeRenderer(viewport.current, {
          onPick: id => callbacks.current.onSelect(id), onHover: hoverMarker,
          onStats: value => callbacks.current.onStats(value), onError: setError,
          onMarkers: markers => markers.forEach(marker => {
            const element = nodes.current[marker.id];
            if (!element) return;
            element.hidden = !marker.visible;
            element.style.transform = `translate(${marker.x}px, ${marker.y}px)`;
          }),
          onFlight: value => {
            if (veil.current) veil.current.style.opacity = Math.max(0, (value - .72) / .28);
            if (progress.current) progress.current.style.transform = `scaleX(${value})`;
          },
        });
        engine.current = instance;
        await instance.load();
        if (!cancelled) { instance.ready = true; instance.setSelection(selectedId, topId); setLoaded(true); }
      } catch (e) { if (!cancelled && e.name !== 'AbortError') setError(e.message || '无法启动地球渲染，请重试。'); }
    }).catch(() => { if (!cancelled) setError('地球渲染器加载失败，请重试。'); });
    return () => { cancelled = true; instance?.dispose(); if (engine.current === instance) engine.current = null; };
  }, [retry]);
  useEffect(() => { engine.current?.setSelection?.(selectedId, topId); if (selectedId) engine.current?.focus?.(selectedId); }, [selectedId, topId, loaded]);
  useEffect(() => { if (loaded) engine.current?.setDensity(density); }, [density, loaded]);

  function select(id) { hoverMarker(null); onSelect(id); }
  const shownHover = locationById(hovered);
  return <div className={`atlas stage-${stage}`} data-stage={stage}>
    <div className="atlas-hero">
      <div className="globe-viewport" ref={viewport}>
        <div className="globe-markers" aria-label="地球上的可用地点">
          {LOCATIONS.map(location => <div key={location.id} ref={node => { nodes.current[location.id] = node; }} className={`globe-marker ${selectedId === location.id ? 'selected' : ''}`} hidden>
            <button aria-label={`地球地点：${location.name}`} aria-pressed={selectedId === location.id} disabled={stage !== 'explore'} onClick={() => select(location.id)} onMouseEnter={() => hoverMarker(location.id)} onMouseLeave={() => hoverMarker(null)} onFocus={() => hoverMarker(location.id)} onBlur={() => hoverMarker(null)}><span className="marker-dot"/><span className="marker-name">{location.english}</span></button>
          </div>)}
        </div>
        <div className="atlas-tools"><button className="icon-button" aria-label="重置地球视角" disabled={stage === 'enter'} onClick={() => engine.current?.resetCamera()}><ArrowCounterClockwise size={18}/></button><span>DRAG TO DISCOVER</span></div>
        {!loaded && !error && <div className="atlas-loading"><CircleNotch className="spin" size={22}/><span>正在点亮地球…</span></div>}
        {error && <div className="atlas-loading" role="alert"><p>{error}</p><button className="primary" onClick={() => setRetry(v => v + 1)}>重试加载</button></div>}
      </div>
      <div className="atlas-copy">
        <div className="eyebrow">{stage === 'explore' && selected ? selected.country.toUpperCase() : heading.label}</div>
        <h1>{stage === 'explore' && selected ? selected.name : <>{heading.title[0]}<br/>{heading.title[1]}</>}</h1>
        <p className="hero-description">{stage === 'explore' && selected ? selected.description : heading.copy}</p>
        {stage === 'connect' && <div className="atlas-action-block">
          <button className="primary" onClick={() => onStage('speak')}>开始我的旅程 <ArrowRight size={17}/></button>
          <button className="text-button atlas-skip" onClick={() => onStage('explore')}>直接探索 {LOCATIONS.length} 个世界 <ArrowRight size={15}/></button>
          <p className="connection-status"><i/>{source === 'simulator' ? '模拟器已就绪 · 无需佩戴设备' : live.signalQuality >= .4 ? '设备信号已就绪' : '等待设备信号 · 可先探索'}</p>
        </div>}
        {stage === 'speak' && <form className="speak-form" onSubmit={onRoute}>
          <label className="sr-only" htmlFor="atlas-intent">描述心情或目的地</label>
          <textarea id="atlas-intent" value={intent} maxLength={500} onChange={e => setIntent(e.target.value)} placeholder="想看富士山的雪，放空一下…" rows={2}/>
          <div className="speak-actions"><button type="button" className="text-button" onClick={voice}><Microphone size={18}/>{listening ? '结束语音输入' : '说出你的心情'}</button><span>{intent.length}/500</span></div>
          <div className="intent-suggestions"><button type="button" onClick={() => setIntent('想去十六湖听水声，释放一下疲惫。')}>想听水声</button><button type="button" onClick={() => setIntent('想去富士山看雪，让自己慢下来。')}>想慢下来</button><button type="button" onClick={() => setIntent('想去多洛米蒂看星空。')}>想看星光</button></div>
          <button className="primary" disabled={routing || !intent.trim()}>{routing ? <><CircleNotch className="spin"/>正在寻找…</> : <>寻找我的目的地 <ArrowRight size={16}/></>}</button>
          <button className="text-button atlas-skip" type="button" onClick={() => onStage('explore')}>自己探索</button>
          <small className="routing-disclosure">{cloud ? 'AI 推荐仅发送你主动输入的文字' : '当前使用本地规则推荐'}</small>
        </form>}
        {stage === 'explore' && (selected ? <div className="destination-detail">
          <span className="destination-english">{selected.english}</span><div className="destination-tags">{selected.theme.join(' / ')}</div>
          <button className="primary" disabled={!loaded || !!error} onClick={() => onEnter(selected.id)}>进入{selected.name} <ArrowRight size={16}/></button>
          <div className="destination-meta"><span>{selected.inspired ? '灵感坐标 · ' : ''}{formatCoordinates(selected)}</span><span>{selected.geographicExtent || `${(selected.pointCount/1000).toFixed(0)}K 点 · 图像重建 · 非实地扫描`}</span></div>
        </div> : <div className="atlas-recommendation"><p>{recommendations.reason}</p><button className="primary" onClick={() => select(topId)}>看看推荐目的地 <ArrowRight size={16}/></button><small>{recommendationLabel} · 由你决定去哪里</small></div>)}
        {stage === 'enter' && <div className="flight-caption" aria-live="polite"><span>{selected?.english}</span><p>{selected?.name} · {selected?.title}</p><div className="flight-progress"><i ref={progress}/></div><button className="text-button" onClick={onCancel}>取消，返回地球</button></div>}
      </div>
    </div>
    {stage === 'explore' && <section className="destination-directory" aria-label="全部目的地">
      <div className="directory-heading"><div><div className="eyebrow">PLACES TO FEEL</div><h2>世界的 {LOCATIONS.length} 种回响。</h2></div><label>寻找目的地<input type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="地点、国家或风景"/></label></div>
      <div className="destination-list">{ranked.filter(item => {const l=locationById(item.locationId);return `${l.name} ${l.country} ${l.english} ${l.theme.join(' ')} ${l.aliases}`.toLowerCase().includes(search.toLowerCase().trim());}).map((item,index) => {const l=locationById(item.locationId);return <button key={l.id} className={`destination-row ${selectedId===l.id?'chosen':''}`} aria-label={`选择目的地：${l.name}`} aria-pressed={selectedId===l.id} onClick={() => {select(l.id);viewport.current?.parentElement.scrollIntoView({behavior:'smooth',block:'start'});}}><span className="destination-index">{String(LOCATIONS.indexOf(l)+1).padStart(2,'0')}</span><span className="destination-row-name">{l.inspired && <img className="destination-thumb" src={`/scene-previews/${l.id}.webp`} alt="" loading="lazy" width="80" height="48"/>}<span>{l.name}<small>{l.country} · {l.title}</small></span></span><span className="destination-row-end">{item.locationId===topId?'为你推荐':l.theme[0]}<ArrowRight size={20}/></span></button>;})}</div>
      {search && !ranked.some(item=>{const l=locationById(item.locationId);return `${l.name} ${l.country} ${l.english} ${l.theme.join(' ')} ${l.aliases}`.toLowerCase().includes(search.toLowerCase().trim());}) && <p className="no-results">还没有这个地点。试试国家或风景名称。</p>}
      <p className="directory-note">{LOCATIONS.length} 个探索世界。富士山与大峡谷使用真实地理数据；其余为图像重建场景，地球上的位置为策划的灵感地点。</p>
    </section>}
    <div className="atlas-bottom"><span>ONE PLANET. YOUR OWN PACE.</span><span>{LOCATIONS.length} WORLDS <i/>{stats.fps || '—'} FPS</span></div>
    <div className="flight-veil" ref={veil}/>
    <span className="sr-only" aria-live="polite">{shownHover ? shownHover.name : selected ? `已选择 ${selected.name}` : ''}</span>
  </div>;
});
