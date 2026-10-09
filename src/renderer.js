import * as THREE from 'three';
import { GESTURE_MAX_AGE_MS } from './core/gestures.mjs';
import { integrateGestureZoom, ZOOM_LIMITS } from './core/gesture-zoom.mjs';

import { pointVertex, pointFragment } from './point-shaders.js';
import { WorldEffects } from './world-effects.js';
import { DEFAULT_VISUAL, normalizeVisual, smoothVisual, dispersionTarget } from './core/visual-style.mjs';

export class WorldRenderer {
  constructor(container, onStats, onError) {
    this.kind = 'world';
    this.container = container;
    this.onStats = onStats;
    this.onError = onError;
    this.clock = 0; this.flowTime = 0; this.dispersion = 0;
    this.visual = normalizeVisual(DEFAULT_VISUAL); this.previousCamera = new THREE.Vector3();
    this.active = true;
    this.reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.coarse = matchMedia('(pointer: coarse)').matches;
    this.world = 'abyss';
    this.density = 1;
    this.state = { coherence: 0.76, attention: 0.58, HR: 72 };
    this.orbit = { x: 0.18, y: 0, zoom: 0 };
    this.inputRevision = 0;
    this.gesture = { mode: 'idle', strength: 0, time: 0 };
    this.viewAttention = this.state.attention; this.viewDrift = 0;
    this.cache = new Map(); this.accentCache = new Map();
    this.transition = 0;
    this.phase = 0;
    this.scene = new THREE.Scene(); this.accentScene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(49, 1, 0.1, 130);
    this.renderer = new THREE.WebGLRenderer({ antialias: false, alpha: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, this.coarse ? 1 : 1.45));
    this.renderer.setClearColor('#000000');
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping; this.renderer.toneMappingExposure = 1.05;
    this.renderer.domElement.setAttribute('aria-label', '交互式三维点云世界，拖动旋转，滚轮缩放');
    this.renderer.domElement.setAttribute('role', 'img');
    container.appendChild(this.renderer.domElement);
    this.uniforms = {
      uTime: { value: 0 }, uCoherence: { value: 0.76 }, uAttention: { value: 0.58 },
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
      this.drag = { x: e.clientX, y: e.clientY };
    }, options);
    canvas.addEventListener('pointerup', () => { this.drag = null; }, options);
    canvas.addEventListener('pointercancel', () => { this.drag = null; }, options);
    canvas.addEventListener('wheel', e => { e.preventDefault(); this.takePointerControl(); this.orbit.zoom = THREE.MathUtils.clamp(this.orbit.zoom + e.deltaY * 0.01, ZOOM_LIMITS.min, ZOOM_LIMITS.max); }, { ...options, passive: false });
    canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); this.onError('图形上下文中断，请刷新页面恢复。'); }, options);
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
    const generation = this.loadGeneration = (this.loadGeneration || 0) + 1;
    if (!this.cache.has(id)) {
      const response = await fetch(`/worlds/${id}.bin`, { signal: this.abort.signal });
      if (!response.ok) throw new Error('点云资源加载失败，请检查本地服务。');
      const data = new Float32Array(await response.arrayBuffer());
      if (this.disposed || generation !== this.loadGeneration) return;
      if (!data.length || data.length % 8) throw new Error('点云文件为空或格式错误。');
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
    this.points = new THREE.Points(this.cache.get(id), this.material);
    this.points.frustumCulled = false;
    this.scene.add(this.points);
    this.accents=new THREE.Points(this.accentCache.get(id),this.accentMaterial);this.accents.frustumCulled=false;this.scene.add(this.accents);
    this.trailAccents=new THREE.Points(this.accentCache.get(id),this.accentMaterial);this.trailAccents.frustumCulled=false;this.accentScene.add(this.trailAccents);
    this.transition = this.reduced ? 0 : 1;
    const bg = '#000000';
    this.renderer.setClearColor(bg);
    this.dispersion=dispersionTarget(this.state.coherence,this.visual);this.effects.reset();
    this.resetCamera();
    this.setDensity(this.density);
    this.ready = true;
  }
  resetCamera() { this.effects?.reset();this.takePointerControl(); this.orbit = { x: this.world === 'sydney-opera' ? -.52 : .13, y: 0, zoom: 0 }; }
  clearGesture() { this.gesture = { mode: 'idle', strength: 0, time: 0 }; }
  takePointerControl() { this.inputRevision++; this.clearGesture(); }
  applyGesture(command,capturedAt=performance.now()) {
    if (!this.ready || !this.active || this.drag || this.disposed) { this.clearGesture(); return; }
    if(performance.now()-capturedAt>GESTURE_MAX_AGE_MS){this.clearGesture();return;}
    this.gesture = { mode: command.mode, zoomRate:command.zoomRate||0, time:capturedAt };
    if (command.mode === 'rotate') {
      this.orbit.x = THREE.MathUtils.clamp(this.orbit.x + command.dx * 3.1, -.85, .85);
      this.orbit.y = THREE.MathUtils.clamp(this.orbit.y + command.dy * 14, -3, 4);
    }
  }
  setVisual(value) {
    const next=normalizeVisual(value);
    if(next.mode!==this.visual.mode||next.palette!==this.visual.palette)this.effects.reset();
    this.visual=next;
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
    this.orbit.zoom=integrateGestureZoom(this.orbit.zoom,this.gesture,now,elapsed,(this.camera.aspect<.8?38:29)-this.viewAttention*1.8);
    if (this.active && !this.reduced) { this.clock += dt; this.flowTime += Math.min(elapsed,.1)*this.visual.speed; this.phase += dt * this.state.HR / 60 * Math.PI * 2; }
    this.transition = Math.max(0, this.transition - dt * 0.65);
    const raw=this.visual.mode==='original';
    this.dispersion=smoothVisual(this.dispersion,dispersionTarget(this.state.coherence,this.visual),Math.min(elapsed,.1),this.visual.recovery);
    this.uniforms.uTransition.value = raw?0:this.transition;
    this.uniforms.uTime.value = this.flowTime;
    this.uniforms.uOriginal.value=raw?1:0;this.uniforms.uDispersion.value=raw?0:this.dispersion;
    this.uniforms.uFlow.value=raw?0:this.visual.flow;
    this.uniforms.uPointScale.value=(this.density<.6?1.65:1.4)*(raw?1:this.visual.pointSize);
    this.uniforms.uBrightness.value=raw?1:this.visual.brightness;
    this.uniforms.uSaturation.value=raw?1:this.visual.saturation;
    this.uniforms.uPalette.value=raw?0:{natural:0,aurora:1,ocean:2}[this.visual.palette];
    this.uniforms.uSoftness.value=raw?0:this.visual.softness;
    if(this.accents)this.accents.visible=!raw;
    if(this.trailAccents)this.trailAccents.visible=!raw;
    this.uniforms.uCoherence.value = this.state.coherence;
    this.uniforms.uAttention.value = this.state.attention;
    this.uniforms.uPulse.value = Math.sin(this.phase);
    const blend = 1 - Math.exp(-dt * 8);
    const drift = this.active && !this.reduced && !this.coarse ? Math.sin(this.clock * 0.055) * 0.025 : 0;
    if (!['rotate', 'zoom'].includes(this.gesture.mode) && !this.drag) {
      this.viewDrift += (drift - this.viewDrift) * blend;
      this.viewAttention += (this.state.attention - this.viewAttention) * blend;
    }
    const angle = this.orbit.x + this.viewDrift;
    const distance = (this.camera.aspect < .8 ? 38 : 29) + this.orbit.zoom - this.viewAttention * 1.8;
    this.camera.position.set(Math.sin(angle) * distance, (this.world === 'colosseum' || this.world === 'grand-canyon' ? 13 : 8) + this.orbit.y, Math.cos(angle) * distance - 4);
    this.camera.lookAt(0, this.world === 'abyss' ? 3 : this.world === 'eiffel' ? 5.5 : 3.6, -5);
    this.uniforms.uFocus.value=this.camera.position.distanceTo(new THREE.Vector3(0,4,-5));
    const moving=!!this.drag||this.camera.position.distanceTo(this.previousCamera)/Math.max(dt,.001)>1.2;
    this.previousCamera.copy(this.camera.position);
    this.effects.render(elapsed,this.visual,{moving,reduced:this.reduced,active:this.active,coarse:this.coarse});
    this.frames++;
    if (now - this.lastStats > 1000) {
      this.onStats({ fps: Math.round(this.frames * 1000 / (now - this.lastStats)), points: this.count || 0 });
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
