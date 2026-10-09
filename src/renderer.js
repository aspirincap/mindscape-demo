import * as THREE from 'three';
import { GESTURE_MAX_AGE_MS } from './core/gestures.mjs';
import { integrateGestureZoom, ZOOM_LIMITS } from './core/gesture-zoom.mjs';

const vertexShader = `
attribute vec3 color;
attribute float size;
attribute float motion;
uniform float uTime;
uniform float uCoherence;
uniform float uAttention;
uniform float uPulse;
uniform float uPixelRatio;
uniform float uTransition;
uniform float uPointScale;

varying vec3 vColor;
varying float vFog;
varying float vAlpha;
float hash(vec3 p) { return fract(sin(dot(p, vec3(127.1,311.7,74.7))) * 43758.5453); }
void main() {
  float seed = hash(position);
  float chaos = pow(clamp((0.87-uCoherence)/0.87,0.0,1.0), 1.8);
  vec3 direction = vec3(hash(position.zyx+1.0), hash(position.yzx+3.0), seed)*2.0-1.0;
  vec3 p = position;
  float dissolve = max(chaos,uTransition);
  vec3 wave = vec3(sin(uTime*0.34+seed*22.0), cos(uTime*0.27+seed*31.0), sin(uTime*0.22+seed*17.0));
  p += direction*dissolve*(5.0+seed*10.0) + wave*dissolve*1.7;
  p.y += motion*sin(uTime*0.35+seed*50.0)*0.38;
  p.x += motion*cos(uTime*0.2+seed*17.0)*0.25;
  p *= 1.0 + uPulse*0.0017*uCoherence;
  vec4 viewPosition = modelViewMatrix*vec4(p,1.0);
  gl_Position = projectionMatrix*viewPosition;
  gl_PointSize = clamp(size*uPointScale*uPixelRatio*(48.0/max(4.0,-viewPosition.z)), 1.0, 14.0*uPixelRatio);
  gl_PointSize *= 1.0 + dissolve*0.55;
  float grey = dot(color,vec3(0.299,0.587,0.114));
  vColor = mix(vec3(grey*0.78),color,0.55+uCoherence*0.45);
  vColor *= 0.85+uAttention*0.3;
  vFog = exp(-pow(max(0.0,-viewPosition.z-12.0)*0.025,1.5));
  vAlpha = (0.7+uCoherence*0.3)*(1.0-uTransition*0.72);
}`;
const fragmentShader = `
precision highp float;
uniform vec3 uFogColor;
varying vec3 vColor;
varying float vFog;
varying float vAlpha;
void main() {
  vec2 uv=gl_PointCoord*2.0-1.0;
  float d=dot(uv,uv);
  if(d>1.0) discard;
  float alpha=exp(-d*2.5)*vAlpha;
  gl_FragColor=vec4(mix(uFogColor,vColor,vFog),alpha);
}`;

export class WorldRenderer {
  constructor(container, onStats, onError) {
    this.kind = 'world';
    this.container = container;
    this.onStats = onStats;
    this.onError = onError;
    this.clock = 0;
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
    this.cache = new Map();
    this.transition = 0;
    this.phase = 0;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(49, 1, 0.1, 130);
    this.renderer = new THREE.WebGLRenderer({ antialias: false, alpha: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, this.coarse ? 1.25 : 1.7));
    this.renderer.setClearColor('#000000');
    this.renderer.domElement.setAttribute('aria-label', '交互式三维点云世界，拖动旋转，滚轮缩放');
    this.renderer.domElement.setAttribute('role', 'img');
    container.appendChild(this.renderer.domElement);
    this.uniforms = {
      uTime: { value: 0 }, uCoherence: { value: 0.76 }, uAttention: { value: 0.58 },
      uPulse: { value: 0 }, uPixelRatio: { value: this.renderer.getPixelRatio() },
      uTransition: { value: 0 }, uPointScale: { value: 1.45 }, uFogColor: { value: new THREE.Color('#000000') },
    };
    this.material = new THREE.ShaderMaterial({ vertexShader, fragmentShader, uniforms: this.uniforms, transparent: true, depthWrite: false, blending: THREE.NormalBlending });
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
        s[i] = data[from + 6]; m[i] = data[from + 7];
      }
      geometry.setAttribute('position', new THREE.BufferAttribute(p, 3));
      geometry.setAttribute('color', new THREE.BufferAttribute(c, 3));
      geometry.setAttribute('size', new THREE.BufferAttribute(s, 1));
      geometry.setAttribute('motion', new THREE.BufferAttribute(m, 1));
      this.cache.set(id, geometry);
    }
    if (generation !== this.loadGeneration || this.disposed) return;
    if (this.points) this.scene.remove(this.points);
    this.world = id;
    this.points = new THREE.Points(this.cache.get(id), this.material);
    this.points.frustumCulled = false;
    this.scene.add(this.points);
    this.transition = this.reduced ? 0 : 1;
    const bg = '#000000';
    this.renderer.setClearColor(bg);
    this.uniforms.uFogColor.value.set(bg);
    this.resetCamera();
    this.setDensity(this.density);
    this.ready = true;
  }
  resetCamera() { this.takePointerControl(); this.orbit = { x: this.world === 'sydney-opera' ? -.52 : .13, y: 0, zoom: 0 }; }
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
  setDensity(density) {
    this.density = density;
    if (!this.points) return;
    this.count = Math.round(this.points.geometry.attributes.position.count * density * (this.coarse ? 0.4 : 1));
    this.points.geometry.setDrawRange(0, this.count);
    this.uniforms.uPointScale.value = density < 0.6 ? 1.9 : 1.45;
  }
  render(now) {
    const elapsed = Math.max(0,(now - this.previous) / 1000);
    const dt = Math.min(elapsed, 0.06);
    this.previous = now;
    if (document.hidden) { this.clearGesture();return; }
    if (!this.active || this.drag || now - this.gesture.time > GESTURE_MAX_AGE_MS || elapsed>.25) this.clearGesture();
    this.orbit.zoom=integrateGestureZoom(this.orbit.zoom,this.gesture,now,elapsed,(this.camera.aspect<.8?38:29)-this.viewAttention*1.8);
    if (this.active && !this.reduced) { this.clock += dt; this.phase += dt * this.state.HR / 60 * Math.PI * 2; }
    this.transition = Math.max(0, this.transition - dt * 0.65);
    this.uniforms.uTransition.value = this.transition;
    this.uniforms.uTime.value = this.clock;
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
    this.renderer.render(this.scene, this.camera);
    this.frames++;
    if (now - this.lastStats > 1000) {
      this.onStats({ fps: Math.round(this.frames * 1000 / (now - this.lastStats)), points: this.count || 0 });
      this.frames = 0; this.lastStats = now;
    }
  }
  dispose() {
    this.disposed = true; this.loadGeneration++;
    this.renderer.setAnimationLoop(null); this.resizeObserver.disconnect(); this.abort.abort();
    this.cache.forEach(geometry => geometry.dispose()); this.material.dispose(); this.renderer.dispose(); this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
  }
}
