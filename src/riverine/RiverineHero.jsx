import React, { useEffect, useRef, useState } from 'react';
import { RIVER_VIDEO, TREE_PATHS, MOTH_PATH, enterRiverine } from './design.mjs';
import './hero.css';

export function RiverineMark({ label = 'Mindscape 意境首页', onClick }) {
  return <a className="rv-logo" href="#" aria-label={label} onClick={onClick}>
    <span className="rv-logo-disc"><svg className="rv-tree" viewBox="0 0 46 46" aria-hidden="true">{TREE_PATHS.map(d => <path key={d} d={d}/>)}</svg></span>
    <svg className="rv-moth" viewBox="0 0 39 30" aria-hidden="true"><path d={MOTH_PATH}/><path d={MOTH_PATH} transform="matrix(-1 0 0 1 39 0)"/></svg>
  </a>;
}
const Down = () => <svg className="rv-chevron" viewBox="0 0 11 6" aria-hidden="true"><path d="M.7.7 5.5 5.3 10.3.7"/></svg>;
const Arrow = ({ partner = false }) => <span className="rv-arrow-disc"><svg viewBox={partner ? '0 0 5 8' : '0 0 6 9'} aria-hidden="true"><path d={partner ? 'M.5.5 3.5 3.5.5 6.5' : 'M.6.6 4 4 .6 7.4'}/></svg></span>;

export function RiverineHero({ onStart, onExplore, onControls, onHelp }) {
  const root = useRef(), video = useRef(), header = useRef(), menu = useRef(), nav = useRef();
  const [open, setOpen] = useState(false), [ambient, setAmbient] = useState(true);
  useEffect(() => enterRiverine(root.current, video.current), []);
  useEffect(() => {
    if (!open) return;
    nav.current.querySelector('a')?.focus();
    const key = e => { if (e.key === 'Escape') { e.preventDefault(); setOpen(false); menu.current.focus(); } };
    const outside = e => { if (!header.current.contains(e.target)) setOpen(false); };
    document.addEventListener('keydown', key); document.addEventListener('pointerdown', outside);
    return () => { document.removeEventListener('keydown', key); document.removeEventListener('pointerdown', outside); };
  }, [open]);
  useEffect(() => {
    const media = matchMedia('(min-width: 650px)');
    const change = () => { if (media.matches) setOpen(false); };
    media.addEventListener('change', change); return () => media.removeEventListener('change', change);
  }, []);
  const action = fn => e => { e.preventDefault(); if (open) menu.current.focus(); setOpen(false); fn(); };
  return <section className="rv-stage rv-waiting" ref={root} aria-label="Mindscape · 跟随心意，流向世界">
    <video ref={video} className="rv-video" src={RIVER_VIDEO} autoPlay muted loop playsInline aria-hidden="true"/>
    <div className="rv-shade rv-shade-x"/><div className="rv-shade rv-shade-y"/><div className="rv-shade rv-shade-corner"/>
    <header className="rv-header" ref={header}>
      <RiverineMark onClick={e => e.preventDefault()}/>
      <button className="rv-menu" ref={menu} aria-label={open ? '关闭导航菜单' : '打开导航菜单'} aria-expanded={open} aria-controls="riverine-navigation" onClick={() => setOpen(v => !v)}>
        <svg className="rv-menu-bars" viewBox="0 0 18 12" aria-hidden="true"><path d="M1 1h16"/><path d="M1 6h16"/><path d="M1 11h16"/></svg>
      </button>
      <nav className={`rv-nav${open ? ' is-open' : ''}`} id="riverine-navigation" ref={nav} aria-label="首页导航">
        <a href="#work" onClick={action(onExplore)}>探索</a>
        <a href="#regenerate" aria-current="page" onClick={action(onStart)}>心意之旅 <Down/></a>
        <a href="#nature" onClick={action(onExplore)}>自然</a>
        <a href="#earth" onClick={action(onExplore)}>地球</a>
        <a href="#news" onClick={action(onHelp)}>指南</a>
        <a className="rv-partner" href="#partner" aria-label="调节共鸣" onClick={action(onControls)}>连接共鸣 <Arrow partner/></a>
      </nav>
      <button className="rv-sound" aria-label="Ambient river sound" aria-pressed={ambient} title="氛围状态开关 · 背景视频保持静音" onClick={() => setAmbient(v => !v)}>
        <svg viewBox="0 0 48 48" aria-hidden="true"><path d="M14.6 19.6h3.6l5.9-4.9v18.6l-5.9-4.9h-3.6z"/><path className="rv-wave" d="M27.6 19.6c1.9 2.8 1.9 6 0 8.8"/><path className="rv-wave" d="M31.2 16.2c3.4 4.9 3.4 10.7 0 15.6"/></svg>
      </button>
    </header>
    <div className="rv-hero">
      <div className="rv-brand">mindscape · 意境</div>
      <h1 className="rv-title">{['跟随呼吸，', '让心意流动，', '与世界共鸣。'].map(line => <span className="rv-title-line" key={line}><span>{line}</span></span>)}</h1>
      <p className="rv-lede"><span>从河流的脉络，走进山海的回响。</span><span>在十二个世界里，找到自己的节奏。</span></p>
      <div className="rv-actions"><a className="rv-cta" href="#future" onClick={action(onStart)}>开始我的旅程 <Arrow/></a><a className="rv-discover" href="#rivers" onClick={action(onExplore)}>直接探索 12 个世界</a></div>
    </div>
    <a className="rv-cue" href="#details" onClick={action(onExplore)}>探索更多 <Down/></a>
  </section>;
}
