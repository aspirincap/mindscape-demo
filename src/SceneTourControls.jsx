import React, { useState } from 'react';
import { locationForWorld } from './core/locations.mjs';
import './geo-controls.css';

const stamp = seconds => `${Math.floor(seconds/60)}:${Math.floor(seconds%60).toString().padStart(2,'0')}`;
export function SceneTourControls({engine,ready,world,paused=false,stats}) {
  const [,refresh]=useState(0);
  const place=locationForWorld(world),tour=ready&&engine.current?.tour?.snapshot();
  if(!place?.inspired||!tour)return null;
  const act=fn=>{fn();refresh(n=>n+1);};
  return <aside className="geo-controls scene-tour-controls" aria-label="微光导览">
    <section className="geo-tour">
      <div className="geo-tour-heading"><div><span className="geo-kicker">LIGHT, COLOUR & A CLOSER LOOK</span><strong>{place.title}</strong></div><span>{paused?'体验已暂停':tour.status==='playing'?'微光导览':tour.status==='paused'?'导览已暂停':'手动探索'}</span></div>
      <div className="geo-tour-progress"><progress aria-label="微光导览进度" max="1" value={tour.progress}/><span>{stamp(tour.elapsed)} / {stamp(tour.duration)}</span></div>
      <p>{tour.chapter}<span> · {tour.autoVisual?'光影随行':'手动光影'}</span></p>
      <div className="geo-tour-actions"><button disabled={paused} onClick={()=>act(()=>tour.status==='playing'?engine.current.pauseTour():engine.current.resumeTour())}>{tour.status==='playing'?'暂停导览':'继续导览'}</button><button disabled={paused} onClick={()=>act(()=>engine.current.resumeTour(true))}>重新导览</button></div>
    </section>
    <details className="geo-navigation-tools"><summary>导览与场景说明</summary><div className="geo-tools-grid">
      <label className="geo-option"><input type="checkbox" checked={tour.autoVisual} disabled={engine.current?.visual.mode==='original'} onChange={event=>act(()=>engine.current.setTourVisual(event.target.checked))}/>粒子与颜色随导览变化</label>
      <p className="scene-tour-note">以{place.name}为灵感的图像重建场景，适合正面与小范围镜头探索。拖动、滚轮或单手动作可接管镜头；点击继续导览会平滑回到路线。</p>
    </div></details>
  </aside>;
}
