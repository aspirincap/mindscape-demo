import { feedbackVisual } from './core/eeg-feedback.mjs';
import * as THREE from 'three';
import { TilesRenderer } from '3d-tiles-renderer/three';
import { WorldEffects } from './world-effects.js';
import { DEFAULT_VISUAL, normalizeVisual, dispersionTarget, smoothVisual } from './core/visual-style.mjs';
import { GESTURE_MAX_AGE_MS } from './core/gestures.mjs';
import { GEO_WORLDS, clamp, sampleElevation, panView, zoomView, gestureZoom } from './core/geo-navigation.mjs';

import { geoPointVertex, geoPointFragment } from './geo-point-shaders.js';

export class GeoRenderer {
 constructor(container,onStats,onError){
  this.kind='world';this.geographic=true;this.container=container;this.onStats=onStats;this.onError=onError;
  this.active=true;this.ready=false;this.coarse=matchMedia('(pointer:coarse)').matches;this.reduced=matchMedia('(prefers-reduced-motion:reduce)').matches;
  this.abort=new AbortController();this.inputRevision=0;this.gesture={mode:'idle',time:0};this.keys=new Set();this.navigationMode='pan';
  this.state={coherence:.76,attention:.58,HR:null};this.visual=normalizeVisual(DEFAULT_VISUAL);this.density=1;this.sseScale=1;this.dispersion=0;this.clock=0;
  this.layers=new Map();this.previousCamera=new THREE.Vector3();this.previousRotation=new THREE.Quaternion();
  this.scene=new THREE.Scene();this.accentScene=new THREE.Scene();this.camera=new THREE.PerspectiveCamera(49,1,1,180000);
  this.renderer=new THREE.WebGLRenderer({antialias:false,powerPreference:'high-performance'});
  this.renderer.setPixelRatio(Math.min(devicePixelRatio,this.coarse?1:1.15));this.renderer.setClearColor('#000000');
  this.renderer.toneMapping=THREE.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.2;
  const canvas=this.renderer.domElement;canvas.setAttribute('aria-label','真实地理点云：拖动平移，右键环绕，滚轮缩放，WASD 移动');canvas.setAttribute('role','img');canvas.tabIndex=0;canvas.style.touchAction='none';container.appendChild(canvas);
  this.effects=new WorldEffects(this.renderer,this.scene,this.accentScene,this.camera);
  // Glow and feedback can be softer than the source view; keep UI / raw pixels intact.
  this.effectPixelRatio=Math.min(this.renderer.getPixelRatio(),this.coarse?.7:.85);
  this.effects.composer.setPixelRatio(this.effectPixelRatio);
  this.uniforms={geoLocked:{value:0},accentFlow:{value:1},accentGain:{value:1},viewportHeight:{value:1},uPixelRatio:{value:this.renderer.getPixelRatio()},pointScale:{value:1},time:{value:0},dispersion:{value:0},flow:{value:1},brightness:{value:1.25},saturation:{value:1.1},palette:{value:1},softness:{value:.22},focus:{value:30000},original:{value:0},heightRange:{value:new THREE.Vector2(0,4000)},extent:{value:new THREE.Vector2(1,1)}};
  const options={signal:this.abort.signal};
  canvas.addEventListener('pointerdown',e=>{if(!this.meta)return;this.takePointerControl();canvas.focus({preventScroll:true});this.drag={id:e.pointerId,x:e.clientX,y:e.clientY,orbit:e.button===2||e.shiftKey};canvas.setPointerCapture(e.pointerId);},options);
  canvas.addEventListener('pointermove',e=>{if(this.drag?.id!==e.pointerId||!this.meta)return;const dx=e.clientX-this.drag.x,dy=e.clientY-this.drag.y;this.move(dx,dy,this.drag.orbit?'orbit':this.navigationMode);this.drag.x=e.clientX;this.drag.y=e.clientY;},options);
  for(const type of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(type,()=>{this.drag=null;},options);
  canvas.addEventListener('contextmenu',e=>e.preventDefault(),options);
  canvas.addEventListener('wheel',e=>{e.preventDefault();this.takePointerControl();if(this.meta)zoomView(this.view,e.deltaY*.0012,this.meta);},{...options,passive:false});
  canvas.addEventListener('keydown',e=>{if(['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code)){e.preventDefault();this.takePointerControl();this.keys.add(e.code);}},options);
  window.addEventListener('keyup',e=>this.keys.delete(e.code),options);
  window.addEventListener('blur',()=>{this.keys.clear();this.drag=null;this.clearGesture();},options);
  document.addEventListener('visibilitychange',()=>{this.keys.clear();this.drag=null;this.clearGesture();},options);
  canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();this.onError('图形上下文中断，请刷新恢复。');},options);
  this.resizeObserver=new ResizeObserver(()=>this.resize());this.resizeObserver.observe(container);this.resize();
  this.previous=performance.now();this.lastStats=this.previous;this.frames=0;this.renderer.setAnimationLoop(now=>this.render(now));
 }
 resize(){const {width,height}=this.container.getBoundingClientRect();this.renderer.setSize(Math.max(1,width),Math.max(1,height),false);this.camera.aspect=width/Math.max(1,height);this.camera.updateProjectionMatrix();this.effects.resize(width,height);this.uniforms.viewportHeight.value=height;this.tiles?.setResolutionFromRenderer(this.camera,this.renderer);}
 async loadWorld(id){
  if(!GEO_WORLDS.has(id))throw new Error('不支持的地理场景');this.world=id;
  const response=await fetch(`/terrain/${id}/manifest.json`,{signal:this.abort.signal});if(!response.ok)throw new Error('地理场景清单加载失败');
  const meta=await response.json();const r=await fetch(meta.heightGrid.url,{signal:this.abort.signal});if(!r.ok)throw new Error('地形导航数据加载失败');
  const heights=new Float32Array(await r.arrayBuffer());if(heights.length!==meta.heightGrid.size**2)throw new Error('地形导航数据不完整');if(this.disposed)return;
  this.meta=meta;this.heights=heights;this.uniforms.heightRange.value.set(...meta.heightRange);this.uniforms.extent.value.set(meta.width,meta.depth);this.resetCamera();
  const tiles=this.tiles=new TilesRenderer(meta.tileset);tiles.setCamera(this.camera);tiles.setResolutionFromRenderer(this.camera,this.renderer);
  tiles.errorTarget=this.coarse?6:3;tiles.downloadQueue.maxJobs=4;tiles.parseQueue.maxJobs=2;
  tiles.lruCache.minBytesSize=(this.coarse?40:90)*1024**2;tiles.lruCache.maxBytesSize=(this.coarse?65:140)*1024**2;tiles.lruCache.minSize=this.coarse?24:48;tiles.lruCache.maxSize=this.coarse?72:160;
  this.scene.add(tiles.group);
  await new Promise((resolve,reject)=>{
   const finish=()=>{clearTimeout(timer);this.abort.signal.removeEventListener('abort',cancel);resolve();};
   const cancel=()=>{clearTimeout(timer);reject(new DOMException('Cancelled','AbortError'));};
   const timer=setTimeout(()=>{this.abort.signal.removeEventListener('abort',cancel);reject(new Error('地理点云读取超时，请检查网络后重试'));},45000);
   this.abort.signal.addEventListener('abort',cancel,{once:true});
   tiles.addEventListener('load-model',({scene,tile})=>{
    this.createTileLayers(scene,tile);
    if(!this.ready){this.ready=true;finish();}
   });
   tiles.addEventListener('tile-visibility-change',({tile,visible})=>{const layer=this.layers.get(tile);if(layer)layer.visible=visible;this.effects.reset();});
   tiles.addEventListener('dispose-model',({tile})=>this.disposeTileLayers(tile));
   tiles.addEventListener('load-error',()=>{this.detailError=true;});
  });
 }
 createTileLayers(scene,tile){
  const items=[];scene.traverse(body=>{
   if(!body.isPoints)return;
   const uniforms={...this.uniforms,spacing:{value:tile.extras?.spacing||12},motionScale:{value:tile.extras?.survey?4:55},accent:{value:0}};
   body.material.dispose();body.material=new THREE.ShaderMaterial({vertexShader:geoPointVertex,fragmentShader:geoPointFragment,uniforms,transparent:true,depthWrite:true});
   const source=body.geometry,positions=source.attributes.position,colors=source.attributes.color,indices=[];
   for(let i=0;i<positions.count;i++){
    const x=Math.round(positions.getX(i)*4),y=Math.round(positions.getY(i)*4),z=Math.round(positions.getZ(i)*4);
    const hash=(Math.imul(x,73856093)^Math.imul(y,19349663)^Math.imul(z,83492791))>>>0;
    if(hash%173===0)indices.push(i);
   }
   const geometry=new THREE.BufferGeometry(),p=new Float32Array(indices.length*3),c=new Float32Array(indices.length*3);
   indices.forEach((index,i)=>{p.set([positions.getX(index),positions.getY(index),positions.getZ(index)],i*3);c.set([colors.getX(index),colors.getY(index),colors.getZ(index)],i*3);});
   geometry.setAttribute('position',new THREE.BufferAttribute(p,3));geometry.setAttribute('color',new THREE.BufferAttribute(c,3));
   const material=new THREE.ShaderMaterial({vertexShader:geoPointVertex,fragmentShader:geoPointFragment,uniforms:{...uniforms,accent:{value:1}},transparent:true,depthWrite:false,blending:THREE.AdditiveBlending});
   const accent=new THREE.Points(geometry,material),trail=new THREE.Points(geometry,material);
   for(const object of [accent,trail]){object.userData.geoAccent=true;object.matrixAutoUpdate=false;object.frustumCulled=false;object.visible=false;}
   this.scene.add(accent);this.accentScene.add(trail);items.push({body,accent,trail,geometry,material});
  });
  this.layers.set(tile,{visible:false,items});
 }
 disposeTileLayers(tile){
  const layer=this.layers.get(tile);if(!layer)return;
  for(const item of layer.items){item.accent.removeFromParent();item.trail.removeFromParent();item.geometry.dispose();item.material.dispose();item.body.material.dispose();}
  this.layers.delete(tile);this.effects.reset();
 }
 resetCamera(){if(!this.meta)return;this.takePointerControl();const p=this.meta.pois[0];this.view={x:p.x,z:p.z,yaw:-.28,pitch:.7,distance:Math.max(this.meta.width,this.meta.depth)*.95};this.targetY=this.elevation(this.view.x,this.view.z)+100;this.effects.reset();}
 elevation(x,z){return sampleElevation(this.meta,this.heights,x,z);}
 focusPoi(id){const p=this.meta?.pois.find(p=>p.id===id);if(!p)return;this.takePointerControl();this.view={...this.view,x:p.x,z:p.z,distance:p.distance,pitch:.67};this.effects.reset();}
 focusMap(u,v){if(!this.meta)return;this.takePointerControl();this.view.x=clamp(u,0,1)*this.meta.width-this.meta.width/2;this.view.z=clamp(v,0,1)*this.meta.depth-this.meta.depth/2;this.view.distance=Math.min(this.view.distance,6500);this.effects.reset();}
 setNavigationMode(mode){this.navigationMode=mode==='orbit'?'orbit':'pan';this.takePointerControl();}
 move(dx,dy,mode=this.navigationMode){if(mode==='orbit'){this.view.yaw-=dx*.004;this.view.pitch=clamp(this.view.pitch+dy*.003,.12,1.45);}else panView(this.view,-dx*this.view.distance*.0013,-dy*this.view.distance*.0013,this.meta);}
 zoom(direction){if(!this.meta)return;this.takePointerControl();zoomView(this.view,direction*.2,this.meta);}
 clearGesture(){this.gesture={mode:'idle',time:0};}
 takePointerControl(){this.inputRevision++;this.clearGesture();}
 applyGesture(command,capturedAt=performance.now()){
  if(!this.ready||!this.active||this.drag||performance.now()-capturedAt>GESTURE_MAX_AGE_MS){this.clearGesture();return;}
  this.gesture={mode:command.mode,zoomRate:command.zoomRate||0,time:capturedAt};
  if(command.mode==='rotate'&&Number.isFinite(command.dx)&&Number.isFinite(command.dy))this.move(command.dx*650,command.dy*650);
 }
 setVisual(visual){const next=normalizeVisual(visual);if(next.mode!==this.visual.mode||next.palette!==this.visual.palette)this.effects.reset();this.visual=next;}
 setDensity(density){this.density=density;}
 retryDetails(){this.detailError=false;this.tiles?.resetFailedTiles();}
 render(now){
  const elapsed=Math.max(0,(now-this.previous)/1000),dt=Math.min(elapsed,.06);this.previous=now;
  if(this.disposed||!this.meta)return;
  if(document.hidden){this.clearGesture();this.effects.reset();return;}
  if(elapsed>.25||this.wasActive!==this.active)this.effects.reset();this.wasActive=this.active;
  if(!this.active||this.drag||elapsed>.25||now-this.gesture.time>GESTURE_MAX_AGE_MS)this.clearGesture();
  if(this.active){gestureZoom(this.view,this.gesture,now,elapsed,this.meta);const dx=(this.keys.has('KeyD')||this.keys.has('ArrowRight')?1:0)-(this.keys.has('KeyA')||this.keys.has('ArrowLeft')?1:0),dz=(this.keys.has('KeyS')||this.keys.has('ArrowDown')?1:0)-(this.keys.has('KeyW')||this.keys.has('ArrowUp')?1:0);panView(this.view,dx*this.view.distance*dt*.35,dz*this.view.distance*dt*.35,this.meta);}
  const v=this.view;this.targetY+=(this.elevation(v.x,v.z)+35-this.targetY)*(1-Math.exp(-dt*5));
  const horizontal=v.distance*Math.cos(v.pitch),cx=v.x+Math.sin(v.yaw)*horizontal,cz=v.z+Math.cos(v.yaw)*horizontal;
  const cy=Math.max(this.targetY+v.distance*Math.sin(v.pitch),this.elevation(cx,cz)+150);
  this.camera.position.set(cx,cy,cz);this.camera.lookAt(v.x,this.targetY,v.z);this.camera.updateMatrixWorld();
  if(this.tiles){this.tiles.errorTarget=(this.coarse?8:4)*this.sseScale/(this.density<.6?.55:1);this.tiles.group.updateMatrixWorld();this.tiles.update();}
  const visual=feedbackVisual(this.visual,this.state,true,this.reduced);
  const raw=this.visual.mode==='original';if(this.active&&!this.reduced)this.clock+=Math.min(elapsed,.1)*this.visual.speed;
  this.dispersion=smoothVisual(this.dispersion,this.state.source==='device'?visual.dispersion:dispersionTarget(this.state.coherence,visual),dt,this.visual.recovery);
  const u=this.uniforms;u.uPixelRatio.value=raw?this.renderer.getPixelRatio():this.effectPixelRatio;u.time.value=this.clock;u.dispersion.value=raw?0:this.dispersion;u.flow.value=raw?0:this.visual.flow;
  u.geoLocked.value=visual.geoLocked?1:0;u.accentFlow.value=visual.accentFlow||1;u.accentGain.value=visual.accentGain;
  u.original.value=raw?1:0;u.pointScale.value=this.visual.pointSize;u.brightness.value=raw?1.15:visual.brightness;
  u.saturation.value=raw?1:this.visual.saturation;u.palette.value=raw?0:{natural:0,aurora:1,ocean:2}[this.visual.palette];
  u.softness.value=raw?0:this.visual.softness;u.focus.value=v.distance;
  for(const layer of this.layers.values())for(const item of layer.items){
   item.accent.visible=item.trail.visible=layer.visible&&!raw;
   if(layer.visible&&!raw){item.body.updateWorldMatrix(true,false);item.accent.matrix.copy(item.body.matrixWorld);item.trail.matrix.copy(item.body.matrixWorld);}
  }
  // A relative threshold works from kilometre overviews down to the crater.
  const moving=!!this.drag||this.camera.position.distanceTo(this.previousCamera)>Math.max(.2,v.distance*.00005)||this.camera.quaternion.angleTo(this.previousRotation)>.0002;
  this.previousCamera.copy(this.camera.position);this.previousRotation.copy(this.camera.quaternion);
  if(raw){this.effects.trail.enabled=false;this.effects.bloom.enabled=false;this.renderer.setRenderTarget(null);this.renderer.render(this.scene,this.camera);}
  else this.effects.render(elapsed,visual,{moving,reduced:this.reduced,active:this.active,coarse:this.coarse});
  this.frames++;
  if(now-this.lastStats>750){let count=0,visible=0;this.tiles?.group.traverseVisible(o=>{if(o.isPoints&&!o.userData.geoAccent){count+=o.geometry.attributes.position.count;visible++;}});this.count=count;
   const fps=Math.round(this.frames*1000/(now-this.lastStats));this.sseScale=clamp(this.sseScale*(fps<24?1.18:fps>48?.92:1),1,3);
   this.onStats({fps,points:count,geo:{x:v.x,z:v.z,distance:v.distance,elevation:this.targetY,altitude:cy,visibleTiles:visible,cachedBytes:this.tiles?.lruCache.cachedBytes||0,partial:!!this.detailError,mode:this.navigationMode}});this.frames=0;this.lastStats=now;}
 }
 dispose(){this.disposed=true;this.abort.abort();this.renderer.setAnimationLoop(null);this.resizeObserver.disconnect();this.tiles?.dispose();for(const tile of this.layers.keys())this.disposeTileLayers(tile);this.effects.dispose();this.renderer.dispose();this.renderer.forceContextLoss();this.renderer.domElement.remove();}
}
export { GeoRenderer as WorldRenderer };
