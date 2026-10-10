import React, { useEffect, useRef, useState } from 'react';
import { X } from '@phosphor-icons/react/dist/csr/X';
import { SlidersHorizontal } from '@phosphor-icons/react/dist/csr/SlidersHorizontal';
import { DEFAULT_VISUAL, VISUAL_PRESETS, VISUAL_RANGES } from './core/visual-style.mjs';
import './visual-controls.css';
import { GEO_WORLDS } from './core/geo-navigation.mjs';
const MODES=[['original','原始点云'],['particles','粒子流动'],['cinematic','完整光影']];
const FIELDS=[['pointSize','粒子尺寸'],['dispersion','聚散程度'],['bloom','光晕强度'],['trail','余辉时长'],['brightness','画面亮度']];
const ADVANCED=[['flow','流动幅度'],['speed','流动速度'],['recovery','恢复时间'],['saturation','色彩浓度'],['softness','远景柔化']];
export function VisualControls({engine,ready,world}) {
  const [open,setOpen]=useState(false),[preset,setPreset]=useState('luminous'),[visual,setVisual]=useState(()=>({...DEFAULT_VISUAL}));
  const panel=useRef(),trigger=useRef();
  useEffect(()=>{if(ready)engine.current?.setVisual?.(visual);},[visual,ready,world,engine]);
  useEffect(()=>{if(open)panel.current?.focus();},[open]);
  const close=()=>{setOpen(false);trigger.current?.focus();};
  const range=([key,label])=><label className="visual-range" key={key}><span>{label}<output>{visual[key].toFixed(2)}{['trail','recovery'].includes(key)?' s':''}</output></span><input aria-label={label} type="range" min={VISUAL_RANGES[key][0]} max={VISUAL_RANGES[key][1]} step="0.01" value={visual[key]} disabled={visual.mode==='original'||(['bloom','trail'].includes(key)&&visual.mode!=='cinematic')} onChange={e=>{setVisual(v=>({...v,[key]:Number(e.target.value)}));setPreset('custom');}}/></label>;
  return <div className="visual-controls">
    <button ref={trigger} className="visual-trigger" aria-expanded={open} aria-controls="visual-panel" disabled={!ready} onClick={()=>setOpen(v=>!v)}><SlidersHorizontal size={15}/>视觉调节<span>{visual.mode==='original'?'原始':visual.mode==='particles'?'粒子':VISUAL_PRESETS[preset]?.name||'自定义'}</span></button>
    {open&&<section id="visual-panel" ref={panel} tabIndex={-1} className="visual-panel" aria-label="视觉调节台" onKeyDown={e=>{if(e.key==='Escape'){e.stopPropagation();close();}}}>
      <header><div><span>LIGHT & MOTION</span><h2>让微光，成为风景。</h2></div><button className="icon-button" aria-label="关闭视觉调节" onClick={close}><X size={18}/></button></header>
      <div className="visual-modes" role="group" aria-label="显示层级">{MODES.map(([id,label])=><button key={id} aria-pressed={visual.mode===id} onClick={()=>setVisual(v=>({...v,mode:id}))}>{label}</button>)}</div>
      <div className="visual-presets" role="group" aria-label="视觉预设">{Object.entries(VISUAL_PRESETS).map(([id,v])=><button key={id} aria-pressed={preset===id} onClick={()=>{setPreset(id);setVisual({...v,mode:'cinematic'});}}><i className={'swatch '+id}/><strong>{v.name}</strong><small>{v.note}</small></button>)}</div>
      <p className="visual-hint">{visual.mode==='original'?'原始结构与色彩；不叠加脑电氛围，作为中性对照。':GEO_WORLDS.has(world)?'实测地形上叠加连续流动与稀疏亮点；移动镜头时清除余辉。':'共鸣控制聚散；转动镜头时余辉自动收起。'}</p>
      <div className="visual-fields">{FIELDS.map(range)}</div>
      <details><summary>更多细节</summary><label className="visual-palette">色彩<select aria-label="色彩风格" value={visual.palette} disabled={visual.mode==='original'} onChange={e=>{setPreset('custom');setVisual(v=>({...v,palette:e.target.value}));}}><option value="natural">原生色彩</option><option value="aurora">冷暖流光</option><option value="ocean">蓝紫梦境</option></select></label>{ADVANCED.map(range)}</details>
      <footer><span>手势继续控制镜头</span><button onClick={()=>{setVisual({...DEFAULT_VISUAL});setPreset('luminous');}}>恢复默认</button></footer>
    </section>}
  </div>;
}
