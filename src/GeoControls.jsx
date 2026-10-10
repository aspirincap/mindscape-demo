import React,{useEffect,useRef,useState} from 'react';
import { GEO_WORLDS } from './core/geo-navigation.mjs';
import './geo-controls.css';
export function GeoControls({engine,ready,world,stats,paused=false}){
 const [meta,setMeta]=useState(null),[open,setOpen]=useState(false),[mode,setMode]=useState('pan');const dialog=useRef();
 const [,refresh]=useState(0);
 useEffect(()=>{setMeta(ready?engine.current?.meta:null);},[ready,world,engine]);
 useEffect(()=>{if(open)dialog.current?.showModal();else dialog.current?.close();},[open]);
 if(!GEO_WORLDS.has(world)||!meta)return null;
 const tour=engine.current?.tour?.snapshot(),act=fn=>{fn();refresh(v=>v+1);};
 const u=Math.max(0,Math.min(1,(stats?.x||0)/meta.width+.5)),v=Math.max(0,Math.min(1,(stats?.z||0)/meta.depth+.5));
 const choose=id=>{engine.current?.focusPoi(id);setOpen(false);};
 const mapClick=e=>{const box=e.currentTarget.getBoundingClientRect();engine.current?.focusMap((e.clientX-box.left)/box.width,(e.clientY-box.top)/box.height);setOpen(false);};
 const marker=<span className="geo-position" style={{left:`${u*100}%`,top:`${v*100}%`}}/>;
 return <>
  <aside className="geo-controls" aria-label="真实地理探索">
   {tour&&<section className="geo-tour" aria-label="空中导览">
    <div className="geo-tour-heading"><div><span className="geo-kicker">A FLIGHT THROUGH THE LAND</span><strong>{tour.name}</strong></div><span>{paused?'体验已暂停':tour.status==='playing'?'空中导览':tour.status==='paused'?'导览已暂停':'自由探索'}</span></div>
    <div className="geo-tour-progress"><progress aria-label="导览路程" max="1" value={tour.progress}/><span>{Math.floor(tour.elapsed/60)}:{Math.floor(tour.elapsed%60).toString().padStart(2,'0')} / {tour.duration/60}:00</span></div>
    <p>{tour.chapter}<span> · {tour.autoVisual?'光影随行':'手动光影'}</span></p>
    <div className="geo-tour-actions"><button disabled={paused} onClick={()=>act(()=>tour.status==='playing'?engine.current?.pauseTour():engine.current?.resumeTour())}>{tour.status==='playing'?'暂停导览':tour.status==='manual'?'继续导览':'开始导览'}</button><button disabled={paused} onClick={()=>act(()=>engine.current?.resumeTour(true))}>重新起飞</button></div>
    <small>{paused?'点击底部播放按钮继续体验':'拖动、滚轮或单手动作，随时接管镜头。'}</small>
   </section>}
   <details className="geo-navigation-tools"><summary>地图与导览设置</summary><div className="geo-tools-grid">
   <button className="geo-mini" onClick={()=>setOpen(true)} aria-label="打开探索地图与数据来源"><img src={meta.satellite} alt={`${meta.name}卫星定位图`}/>{marker}<span>N ↑</span></button>
   <div className="geo-hud"><span className="geo-kicker">EXPLORE THE REAL WORLD</span><strong>{(meta.width/1000).toFixed(0)} × {(meta.depth/1000).toFixed(0)} km</strong><small>视距 {((stats?.distance||0)/1000).toFixed(1)} km</small><button className="geo-map-link" onClick={()=>setOpen(true)}>探索地图与来源 ↗</button></div>
   <div className="geo-mode" role="group" aria-label="镜头移动模式">{[['pan','平移'],['orbit','环绕']].map(([id,label])=><button key={id} aria-pressed={mode===id} onClick={()=>{setMode(id);engine.current?.setNavigationMode(id);}}>{label}</button>)}<button onClick={()=>engine.current?.zoom(-1)} aria-label="拉近地形">＋</button><button onClick={()=>engine.current?.zoom(1)} aria-label="拉远地形">−</button></div>
   <select aria-label="跳转地理地标" value="" onChange={e=>choose(e.target.value)}><option value="" disabled>前往一处地标…</option>{meta.pois.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select>
   <label className="geo-option"><input type="checkbox" checked={engine.current?.edgeFade??true} onChange={e=>act(()=>engine.current?.setEdgeFade(e.target.checked))}/>边缘渐隐</label>
   <label className="geo-option"><input type="checkbox" checked={tour?.autoVisual??true} disabled={engine.current?.visual.mode==='original'} onChange={e=>act(()=>engine.current?.setTourVisual(e.target.checked))}/>光影随导览变化</label>
   </div></details>
   {stats?.partial&&<button className="geo-retry" onClick={()=>engine.current?.retryDetails()}>部分细节未载入 · 重试</button>}
  </aside>
  <dialog className="geo-dialog" ref={dialog} aria-label={`${meta.name}探索地图与来源`} onCancel={()=>setOpen(false)} onClick={e=>{if(e.target===dialog.current)setOpen(false);}}>
   <header><div><span className="geo-kicker">REAL PLACES / REAL SCALE</span><h2>{meta.name} · 探索地图</h2></div><button onClick={()=>setOpen(false)} aria-label="关闭探索地图">✕</button></header>
   <p>点击地图移动探索中心，或选择下方地标。</p>
   <div className="geo-map-wrap"><button className="geo-large-map" onClick={mapClick} aria-label="点击卫星地图定位探索中心"><img src={meta.satellite} alt={`${meta.name}真实卫星选区`}/>{marker}<span className="geo-north">N ↑</span><span className="geo-scale" style={{width:`${5000/meta.width*100}%`}}>5 km</span></button>{meta.pois.map(p=><button key={p.id} className="geo-pin" style={{left:`${(p.x/meta.width+.5)*100}%`,top:`${(p.z/meta.depth+.5)*100}%`}} title={p.name} aria-label={`前往${p.name}`} onClick={()=>choose(p.id)}>●</button>)}</div>
   <div className="geo-pois">{meta.pois.map(p=><button key={p.id} onClick={()=>choose(p.id)}>{p.name} ↗</button>)}</div>
   <dl><div><dt>真实范围</dt><dd>{(meta.width/1000).toFixed(1)} × {(meta.depth/1000).toFixed(1)} km</dd></div><div><dt>卫星拍摄</dt><dd>{meta.satelliteDate} · Sentinel-2</dd></div><div><dt>地形来源</dt><dd>{world==='fuji'?'GSI 区域高程 + 静冈山顶实测点云':'USGS 3DEP · 1 m / 10 m 高程'}</dd></div><div><dt>几何尺度</dt><dd>1:1 米制 · 无高度夸张</dd></div></dl>
   {world==='fuji'&&<p className="geo-source-note">山顶直接使用 VIRTUAL SHIZUOKA 点云的实测位置与原生颜色；外围为真实高程地形。测绘与卫星影像日期不同，颜色可能有差异。</p>}
   <details><summary>精度、来源与授权</summary><p>{meta.limitations}区域地形显示采样间距约 {Math.max(...meta.terrainPointSpacingM).toFixed(0)} 米。</p>{world==='grand-canyon'&&<p>1 米源数据覆盖约 {Math.round((meta.sources.elevation.oneMeterSourceCoverage||0)*100)}%，其余由约 10 米 USGS 高程补全。</p>}{meta.attribution.map(t=><p key={t}>{t}</p>)}<a href={meta.sources.elevation.url} target="_blank" rel="noreferrer">官方高程来源 ↗</a>{meta.sources.lidar&&<a href={meta.sources.lidar.catalog} target="_blank" rel="noreferrer">官方点云来源 ↗</a>}<a href="https://registry.opendata.aws/sentinel-2-l2a-cogs/" target="_blank" rel="noreferrer">卫星影像来源 ↗</a><a href={meta.selection} target="_blank" rel="noreferrer">查看完整选区图 ↗</a></details>
  </dialog>
 </>;
}
