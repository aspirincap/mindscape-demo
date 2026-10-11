import { feedbackVisual } from './core/eeg-feedback.mjs';
import * as THREE from 'three';
import { GESTURE_MAX_AGE_MS } from './core/gestures.mjs';
import { integrateGestureZoom, ZOOM_LIMITS } from './core/gesture-zoom.mjs';

import { pointVertex, pointFragment } from './point-shaders.js';
import { WorldEffects } from './world-effects.js';
import { normalizeVisual, smoothVisual, dispersionTarget } from './core/visual-style.mjs';
import { sceneAsset } from './core/scene-assets.mjs';
import { scenePlayback, clampSceneOrbit, clearSceneVisual, sceneTourVisual } from './core/scene-tour.mjs';
import { blendVisual } from './core/geo-tour.mjs';

export class WorldRenderer {
  constructor(container, onStats, onError) {
    this.kind = 'world';
    this.container = container;
    this.onStats = onStats;
    this.onError = onError;
    this.clock = 0; this.flowTime = 0; this.dispersion = 0;
    this.visual = clearSceneVisual(); this.displayVisual = {...this.visual, paletteMix:0}; this.previousCamera = new THREE.Vector3();
    this.active = true;
    this.reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.coarse = matchMedia('(pointer: coarse)').matches;
    this.world = 'scene-01';
    this.density = 1;
    this.state = { coherence: 0.76, attention: 0.58, HR: null };
    this.orbit = { x: 0.18, y: 0, zoom: 0 };
    this.inputRevision = 0;
    this.gesture = { mode: 'idle', strength: 0, time: 0 };
    this.cache = new Map(); this.accentCache = new Map();
    this.transition = 0;
    this.phase = 0;
    this.scene = new THREE.Scene(); this.accentScene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(49, 1, 0.1, 130);
    this.renderer = new THREE.WebGLRenderer({ antialias: false, alpha: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, this.coarse ? 1 : 1.45));
    this.renderer.setClearColor('#000000');
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping; this.renderer.toneMappingExposure = 1.05;
    this.renderer.domElement.setAttribute('aria-label', '交互式点云场景，拖动小幅探索，滚轮缩放');
    this.renderer.domElement.setAttribute('role', 'img');
    container.appendChild(this.renderer.domElement);
    this.uniforms = {
      uAccentGain: { value: 1 }, uTime: { value: 0 }, uCoherence: { value: 0.76 }, uAttention: { value: 0.58 },
      uPulse: { value: 0 }, uPixelRatio: { value: this.renderer.getPixelRatio() },
      uTransition: { value: 0 }, uPointScale: { value: 1.45 },
      uDispersion:{value:0},uFlow:{value:1},uOriginal:{value:0},uBrightness:{value:1.25},
      uSaturation:{value:1.1},uPalette:{value:1},uSoftness:{value:.22},uFocus:{value:29},uAccent:{value:0},
    };
    this.material = new THREE.ShaderMaterial({ vertexShader:pointVertex, fragmentShader:pointFragment, uniforms:this.uniforms, transparent:true, depthWrite:true, blending:THREE.NormalBlending });
    this.accentMaterial = new THREE.ShaderMaterial({ vertexShader:pointVertex, fragmentShader:pointFragment, uniforms:{...this.uniforms,uAccent:{value:1}}, transparent:true, depthWrite:false, blending:THREE.AdditiveBlending });
    this.effects = new WorldEffects(this.renderer,this.scene,this.accentScene,this.camera);
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.resize();
    this.abort = new AbortController();
    const options = { signal: this.abort.signal };
    const canvas = this.renderer.domElement;
    canvas.addEventListener('pointerdown', e => { this.takePointerControl(); this.drag = { x: e.clientX, y: e.clientY }; canvas.setPointerCapture(e.pointerId); }, options);
    canvas.addEventListener('pointermove', e => {
      if (!this.drag) return;
      this.orbit.x = THREE.MathUtils.clamp(this.orbit.x + (e.clientX - this.drag.x) * 0.003, -0.85, 0.85);
      this.orbit.y = THREE.MathUtils.clamp(this.orbit.y + (e.clientY - this.drag.y) * 0.015, -3, 4);
      this.constrainCamera();
      this.drag = { x: e.clientX, y: e.clientY };
    }, options);
    canvas.addEventListener('pointerup', () => { this.drag = null; }, options);
    canvas.addEventListener('pointercancel', () => { this.drag = null; }, options);
    canvas.addEventListener('wheel', e => { e.preventDefault(); this.takePointerControl(); this.orbit.zoom = THREE.MathUtils.clamp(this.orbit.zoom + e.deltaY * 0.003, ZOOM_LIMITS.min, ZOOM_LIMITS.max); this.constrainCamera(); }, { ...options, passive: false });
    canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); this.onError('图形上下文中断，请刷新页面恢复。'); }, options);
    matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', e => { this.reduced=e.matches;if(e.matches)this.pauseTour();this.effects.reset(); }, options);
    this.previous = performance.now();
    this.lastStats = this.previous;
    this.frames = 0;
    this.renderer.setAnimationLoop(now => this.render(now));
  }
  resize() {
    const { width, height } = this.container.getBoundingClientRect();
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / Math.max(1, height);
    this.camera.updateProjectionMatrix();
    this.effects?.resize(Math.max(1,width),Math.max(1,height));
  }
  async loadWorld(id) {
    const asset = sceneAsset(id);
    if (!asset) throw new Error('未知场景，请返回地球重新选择。');
    const generation = this.loadGeneration = (this.loadGeneration || 0) + 1;
    if (!this.cache.has(id)) {
      const response = await fetch(asset.url, { signal: this.abort.signal });
      if (!response.ok) throw new Error('点云资源加载失败，请稍后重试。');
      const data = new Float32Array(await response.arrayBuffer());
      if (this.disposed || generation !== this.loadGeneration) return;
      if (data.length !== asset.count*8) throw new Error('点云文件不完整，请稍后重试。');
      const geometry = new THREE.BufferGeometry();
      const count = data.length / 8;
      const indices = Array.from({ length: count }, (_, i) => i);
      // Mix point order so drawRange reductions preserve the whole scene.
      let seed = 42;
      for (let i = count - 1; i > 0; i--) { seed = (seed * 1664525 + 1013904223) >>> 0; const j = seed % (i + 1); [indices[i], indices[j]] = [indices[j], indices[i]]; }
      const p = new Float32Array(count * 3), c = new Float32Array(count * 3), s = new Float32Array(count), m = new Float32Array(count);
      for (let i = 0; i < count; i++) {
        const from = indices[i] * 8;
        p.set(data.subarray(from, from + 3), i * 3); c.set(data.subarray(from + 3, from + 6), i * 3);
        // Source RGB is display-referred. Work in linear light until OutputPass.
        for(let j=0;j<3;j++){const v=c[i*3+j];c[i*3+j]=v<=.04045?v/12.92:((v+.055)/1.055)**2.4;}
        s[i] = data[from + 6]; m[i] = data[from + 7];
      }
      geometry.setAttribute('position', new THREE.BufferAttribute(p, 3));
      geometry.setAttribute('color', new THREE.BufferAttribute(c, 3));
      geometry.setAttribute('size', new THREE.BufferAttribute(s, 1));
      geometry.setAttribute('motion', new THREE.BufferAttribute(m, 1));
      this.cache.set(id, geometry);
      const accent=new THREE.BufferGeometry(),n=Math.ceil(count/53);
      for(const [name,itemSize,source]of [['position',3,p],['color',3,c],['size',1,s],['motion',1,m]]){
        const values=new Float32Array(n*itemSize);
        for(let j=0;j<n;j++)values.set(source.subarray(j*53*itemSize,(j*53+1)*itemSize),j*itemSize);
        accent.setAttribute(name,new THREE.BufferAttribute(values,itemSize));
      }
      this.accentCache.set(id,accent);
    }
    if (generation !== this.loadGeneration || this.disposed) return;
    if (this.points) this.scene.remove(this.points);
    if(this.accents)this.scene.remove(this.accents);
    if(this.trailAccents)this.accentScene.remove(this.trailAccents);
    this.world = id;
    this.model = asset;
    this.points = new THREE.Points(this.cache.get(id), this.material);
    this.points.frustumCulled = false;
    this.scene.add(this.points);
    this.accents=new THREE.Points(this.accentCache.get(id),this.accentMaterial);this.accents.frustumCulled=false;this.scene.add(this.accents);
    this.trailAccents=new THREE.Points(this.accentCache.get(id),this.accentMaterial);this.trailAccents.frustumCulled=false;this.accentScene.add(this.trailAccents);
    this.transition = 0;
    const bg = '#000000';
    this.renderer.setClearColor(bg);
    this.visual=clearSceneVisual();this.displayVisual={...this.visual,paletteMix:0};this.dispersion=0;this.effects.reset();
    this.resetCamera();
    this.tour=scenePlayback(id,this.reduced);
    this.setDensity(this.density);
    this.ready = true;
  }
  resetCamera() { this.effects?.reset();this.takePointerControl(); this.orbit = { x: this.model?.camera.orbit_x ?? .13, y: 0, zoom: 0 }; }
  constrainCamera() { if(this.model)this.orbit=clampSceneOrbit(this.model,this.orbit); }
  takeCameraControl() { this.tour?.manual();this.join=null; }
  clearGesture() { this.gesture = { mode: 'idle', strength: 0, time: 0 }; }
  takePointerControl() { this.inputRevision++; this.clearGesture();this.takeCameraControl(); }
  pauseTour() { this.tour?.pause();this.clearGesture(); }
  resumeTour(restart=false) {
    if(!this.tour)return;
    this.clearGesture();this.effects.reset();
    this.join=this.reduced?null:{from:{...this.orbit},time:0};
    if(restart){this.tour.restart();if(this.visual.mode==='original')this.tour.autoVisual=false;}else this.tour.resume();
  }
  setTourVisual(enabled) { if(this.tour&&(!enabled||this.visual.mode!=='original'))this.tour.autoVisual=enabled; }
  applyGesture(command,capturedAt=performance.now()) {
    if (!this.ready || !this.active || this.drag || this.disposed) { this.clearGesture(); return; }
    if(performance.now()-capturedAt>GESTURE_MAX_AGE_MS){this.clearGesture();return;}
    if((command.mode==='rotate'&&Math.hypot(command.dx||0,command.dy||0)>.0001)||(command.mode==='zoom'&&Math.abs(command.zoomRate||0)>.001))this.takeCameraControl();
    this.gesture = { mode: command.mode, zoomRate:command.zoomRate||0, time:capturedAt };
    if (command.mode === 'rotate') {
      this.orbit.x = THREE.MathUtils.clamp(this.orbit.x + command.dx * 3.1, -.85, .85);
      this.orbit.y = THREE.MathUtils.clamp(this.orbit.y + command.dy * 14, -3, 4);
      this.constrainCamera();
    }
  }
  setVisual(value,{manual=true}={}) {
    const next=normalizeVisual(value);
    if(next.mode!==this.visual.mode||next.palette!==this.visual.palette)this.effects.reset();
    this.visual=next;
    if(manual&&this.tour)this.tour.autoVisual=false;
  }
  setDensity(density) {
    this.density = density;
    if (!this.points) return;
    this.count = Math.round(this.points.geometry.attributes.position.count * density * (this.coarse ? 0.4 : 1));
    this.points.geometry.setDrawRange(0, this.count);
    this.effects?.reset();
  }
  render(now) {
    const elapsed = Math.max(0,(now - this.previous) / 1000);
    const dt = Math.min(elapsed, 0.06);
    this.previous = now;
    if (document.hidden) { this.clearGesture();this.effects.reset();return; }
    if(elapsed>.25||this.wasActive!==this.active)this.effects.reset();this.wasActive=this.active;
    if (!this.active || this.drag || now - this.gesture.time > GESTURE_MAX_AGE_MS || elapsed>.25) this.clearGesture();
    if(this.tour&&this.tour.status!=='manual'){
      const pose=this.tour.advance(elapsed,this.active);
      if(this.join){
        if(this.active&&this.tour.status==='playing'&&elapsed<=.25)this.join.time+=elapsed;
        const p=Math.min(1,this.join.time/3),t=p*p*(3-2*p);
        for(const key of ['x','y','zoom'])this.orbit[key]=this.join.from[key]+(pose[key]-this.join.from[key])*t;
        if(p===1)this.join=null;
      }else this.orbit={...pose};
    }
    const follow=this.tour?.autoVisual&&this.visual.mode!=='original';
    const target=follow?{...sceneTourVisual(this.tour.time/this.tour.route.duration),mode:this.visual.mode}:this.visual;
    this.displayVisual=blendVisual(this.displayVisual,target,this.active?dt:0);
    const visual = feedbackVisual(this.displayVisual, this.state, false, this.reduced);
    const baseDistance=this.model?Math.hypot(this.model.camera.position[0],this.model.camera.position[2]+4):29;
    this.orbit.zoom=integrateGestureZoom(this.orbit.zoom,this.gesture,now,elapsed,baseDistance);
    this.constrainCamera();
    if (this.active && !this.reduced) { this.clock += dt; this.flowTime += Math.min(elapsed,.1)*visual.speed; this.phase += dt * (this.state.HR ?? 0) / 60 * Math.PI * 2; }
    this.transition = Math.max(0, this.transition - dt * 0.65);
    const raw=this.visual.mode==='original';
    this.dispersion=smoothVisual(this.dispersion,this.state.source === 'device'||follow ? visual.dispersion : dispersionTarget(this.state.coherence,visual),this.active?Math.min(elapsed,.1):0,visual.recovery);
    this.uniforms.uTransition.value = raw?0:this.transition;
    this.uniforms.uTime.value = this.flowTime;
    this.uniforms.uOriginal.value=raw?1:0;this.uniforms.uDispersion.value=raw?0:this.dispersion;
    this.uniforms.uFlow.value=raw?0:visual.flow;
    this.uniforms.uPointScale.value=(this.density<.6?1.65:1.4)*(raw?1:visual.pointSize);
    this.uniforms.uBrightness.value=raw?1:visual.brightness;
    this.uniforms.uSaturation.value=raw?1:visual.saturation;
    this.uniforms.uPalette.value=raw?0:visual.paletteMix;
    this.uniforms.uSoftness.value=raw?0:visual.softness;
    if(this.accents)this.accents.visible=!raw;
    if(this.trailAccents)this.trailAccents.visible=!raw;
    this.uniforms.uAccentGain.value = visual.accentGain;
    this.uniforms.uCoherence.value = this.state.coherence;
    this.uniforms.uAttention.value = raw ? .5 : this.state.source === 'device' ? .5 + visual.eegMix * ((this.state.attentionControl ?? .5) - .5) : this.state.attention;
    this.uniforms.uPulse.value = this.state.HR == null || this.reduced ? 0 : Math.sin(this.phase);
    const angle = this.orbit.x;
    const distance = baseDistance + this.orbit.zoom;
    this.camera.position.set(Math.sin(angle) * distance, (this.model?.camera.position[1]??8) + this.orbit.y, Math.cos(angle) * distance - 4);
    this.camera.lookAt(...(this.model?.camera.target??[0,3.6,-5]));
    this.uniforms.uFocus.value=this.camera.position.distanceTo(new THREE.Vector3(0,4,-5));
    const moving=!!this.drag||this.camera.position.distanceTo(this.previousCamera)/Math.max(dt,.001)>1.2;
    this.previousCamera.copy(this.camera.position);
    this.effects.render(elapsed,visual,{moving,reduced:this.reduced,active:this.active,coarse:this.coarse});
    this.frames++;
    if (now - this.lastStats > 1000) {
      this.onStats({ fps: Math.round(this.frames * 1000 / (now - this.lastStats)), points: this.count || 0, tour:this.tour?.snapshot() });
      this.frames = 0; this.lastStats = now;
    }
  }
  dispose() {
    this.disposed = true; this.loadGeneration++;
    this.renderer.setAnimationLoop(null); this.resizeObserver.disconnect(); this.abort.abort();
    this.cache.forEach(geometry => geometry.dispose());this.accentCache.forEach(geometry=>geometry.dispose());this.effects.dispose();this.accentMaterial.dispose(); this.material.dispose(); this.renderer.dispose(); this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
  }
}
