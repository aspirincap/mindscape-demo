import React, { useEffect, useRef, useState } from 'react';
import { enterRiverine } from './design.mjs';
import { Brand } from '../Brand';
import { HERO_SLIDES, useHeroSlideshow } from './slideshow';
import './hero.css';
import { LOCATIONS } from '../core/locations.mjs';

const Down = () => <svg className="rv-chevron" viewBox="0 0 11 6" aria-hidden="true"><path d="M.7.7 5.5 5.3 10.3.7"/></svg>;
const Arrow = ({ partner = false }) => <span className="rv-arrow-disc"><svg viewBox={partner ? '0 0 5 8' : '0 0 6 9'} aria-hidden="true"><path d={partner ? 'M.5.5 3.5 3.5.5 6.5' : 'M.6.6 4 4 .6 7.4'}/></svg></span>;

export function RiverineHero({ onStart, onExplore, onControls, onHelp }) {
  const root = useRef(), header = useRef(), menu = useRef(), nav = useRef();
  const [open, setOpen] = useState(false);
  const carousel = useHeroSlideshow();
  useEffect(() => enterRiverine(root.current), []);
  useEffect(() => {
    if (!open) return;
    nav.current.querySelector('a')?.focus();
    const key = e => { if (e.key === 'Escape') { e.preventDefault(); setOpen(false); menu.current.focus(); } };
    const outside = e => { if (!header.current.contains(e.target)) setOpen(false); };
    document.addEventListener('keydown', key); document.addEventListener('pointerdown', outside);
    return () => { document.removeEventListener('keydown', key); document.removeEventListener('pointerdown', outside); };
  }, [open]);
  useEffect(() => {
    const media = matchMedia('(min-width: 761px)');
    const change = () => { if (media.matches) setOpen(false); };
    media.addEventListener('change', change); return () => media.removeEventListener('change', change);
  }, []);
  const action = fn => e => { e.preventDefault(); if (open) menu.current.focus(); setOpen(false); fn(); };
  return <section className="rv-stage rv-waiting" ref={root} data-carousel-paused={!carousel.running} aria-label="在野 · Go Wild · 跟随心意，流向世界">
    <div className="rv-backdrop" aria-hidden="true">
      {HERO_SLIDES.map((slide, index) => <div key={slide.name} className={`rv-slide${carousel.current === index ? ' is-current' : carousel.previous === index ? ' is-previous' : ''}`} style={{ '--slide-focus': slide.focus }}>
        <img src={slide.src} srcSet={`${slide.small} 960w, ${slide.src} 1672w`} sizes="(max-aspect-ratio: 16/9) 178vh, 100vw" width="1672" height="941" alt="" decoding="async" fetchPriority={index === 0 ? 'high' : 'low'} onLoad={event => carousel.loaded(event.currentTarget, index)} onError={() => carousel.failed(index)}/>
      </div>)}
    </div>
    <div className="rv-shade rv-shade-x"/><div className="rv-shade rv-shade-y"/><div className="rv-shade rv-shade-corner"/>
    <header className="rv-header" ref={header}>
      <Brand className="rv-logo" onClick={e => e.preventDefault()}/>
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
      <button className="rv-playback" aria-label={carousel.paused ? '播放背景轮播' : '暂停背景轮播'} title={carousel.paused ? '播放背景轮播' : '暂停背景轮播'} onClick={() => carousel.setPaused(value => !value)}>
        <svg viewBox="0 0 48 48" aria-hidden="true">{carousel.paused ? <path d="m20 16 12 8-12 8z"/> : <><path d="M20 16v16"/><path d="M28 16v16"/></>}</svg>
      </button>
    </header>
    <div className="rv-hero">
      <div className="rv-brand">在野 · Go Wild</div>
      <h1 className="rv-title">{['跟随呼吸，', '让心意流动，', '与世界共鸣。'].map(line => <span className="rv-title-line" key={line}><span>{line}</span></span>)}</h1>
      <p className="rv-lede"><span>从河流的脉络，走进山海的回响。</span><span>在 {LOCATIONS.length} 个世界里，找到自己的节奏。</span></p>
      <div className="rv-actions"><a className="rv-cta" href="#future" onClick={action(onStart)}>开始我的旅程 <Arrow/></a><a className="rv-discover" href="#rivers" onClick={action(onExplore)}>直接探索 {LOCATIONS.length} 个世界</a></div>
    </div>
    <div className="rv-carousel-controls" role="group" aria-label="首页背景选择" onFocusCapture={() => carousel.setFocused(true)} onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget)) carousel.setFocused(false); }}>
      <span className="rv-slide-name">{HERO_SLIDES[carousel.current].name}</span>
      <div className="rv-slide-dots">{HERO_SLIDES.map((slide, index) => <button key={slide.name} aria-label={`查看背景：${slide.name}`} aria-pressed={carousel.current === index} disabled={!carousel.ready.includes(index) || carousel.transitioning} onClick={() => carousel.select(index, true)}><span/></button>)}</div>
    </div>
    <a className="rv-cue" href="#details" onClick={action(onExplore)}>探索更多 <Down/></a>
  </section>;
}
