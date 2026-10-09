import * as THREE from 'three';
import { LOCATIONS, latLngToXYZ } from './core/locations.mjs';

const RADIUS = 2.4;
const Z_AXIS = new THREE.Vector3(0, 0, 1);
const landVertex = `
uniform float uTime; uniform float uChaos; uniform float uFlight; uniform float uRatio;
varying float vLight; varying float vAlpha; varying vec3 vColor;
void main(){
 float seed=fract(sin(dot(position,vec3(127.1,311.7,74.7)))*43758.5453);
 vec3 p=position*(2.405+sin(uTime*.8+seed*9.)*uChaos*.005);
 p+=normalize(position)*uFlight*seed*1.2;
 vec4 mv=modelViewMatrix*vec4(p,1.);
 gl_Position=projectionMatrix*mv;
 gl_PointSize=clamp(uRatio*2.6*(7.5/-mv.z),1.5,7.);
 vColor=seed<.32?vec3(.50,.32,1.):seed<.52?vec3(1.,.72,.16):seed<.72?vec3(.12,.63,.49):seed<.88?vec3(.33,.53,1.):vec3(.95,.39,.69);
 vec3 normal=normalize(mat3(modelMatrix)*position);
 vLight=.44+.56*max(0.,dot(normal,normalize(vec3(-.7,.7,1.))));
 vAlpha=1.-uFlight*.65;
}`;
const landFragment = `
varying float vLight; varying float vAlpha; varying vec3 vColor;
void main(){vec2 p=gl_PointCoord*2.-1.;float d=max(abs(p.x)*.866-p.y*.5,p.y)-.45;if(d>0.)discard;float edge=smoothstep(-.26,-.06,d);gl_FragColor=vec4(vColor*(.65+vLight*.35),(.22+edge*.78)*vAlpha);}`;

export class GlobeRenderer {
  constructor(container, { onMarkers, onPick, onHover, onFlight, onStats, onError }) {
    this.kind = 'globe'; this.container = container;
    Object.assign(this, { onMarkers, onPick, onHover, onFlight, onStats, onError });
    this.state = { coherence: .76, attention: .58, HR: 72 };
    this.active = true; this.time = 0; this.phase = 0; this.frames = 0;
    this.reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.coarse = matchMedia('(pointer: coarse)').matches;
    this.abort = new AbortController(); this.velocity = new THREE.Vector2();
    this.scene = new THREE.Scene(); this.globe = new THREE.Group(); this.scene.add(this.globe);
    this.camera = new THREE.PerspectiveCamera(42, 1, .05, 100);
    this.distance = 8.1; this.camera.position.z = this.distance;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, this.coarse ? 1.3 : 1.8));
    this.renderer.setClearColor('#000000', 0);
    const canvas = this.renderer.domElement;
    canvas.setAttribute('aria-label', '三维地球，可拖动旋转，滚轮缩放，点击地点');
    canvas.setAttribute('role', 'img'); container.appendChild(canvas);
    const sphere = new THREE.Mesh(new THREE.SphereGeometry(RADIUS, 80, 64), new THREE.MeshPhongMaterial({ color: '#000000', shininess: 0, specular: '#000000' }));
    this.globe.add(sphere);
    this.scene.add(new THREE.AmbientLight('#a3c0d0', .6));
    const sun = new THREE.DirectionalLight('#b8ceda', 2.2); sun.position.set(-5, 6, 7); this.scene.add(sun);
    const shellMaterial = new THREE.ShaderMaterial({
      vertexShader: `varying vec3 vNormal;varying vec3 vView;void main(){vec4 p=modelViewMatrix*vec4(position,1.);vNormal=normalize(normalMatrix*normal);vView=normalize(-p.xyz);gl_Position=projectionMatrix*p;}`,
      fragmentShader: `varying vec3 vNormal;varying vec3 vView;uniform float uCalm;void main(){float rim=pow(1.-abs(dot(normalize(vNormal),normalize(vView))),4.);gl_FragColor=vec4(.50,.32,1.,rim*(.04+uCalm*.03));}`,
      uniforms: { uCalm: { value: .76 } }, transparent: true, depthWrite: false, side: THREE.BackSide,
    });
    this.atmosphere = new THREE.Mesh(new THREE.SphereGeometry(RADIUS * 1.027, 64, 48), shellMaterial); this.globe.add(this.atmosphere);
    this.uniforms = { uTime: { value: 0 }, uChaos: { value: .24 }, uFlight: { value: 0 }, uRatio: { value: this.renderer.getPixelRatio() } };
    this.landMaterial = new THREE.ShaderMaterial({ uniforms: this.uniforms, vertexShader: landVertex, fragmentShader: landFragment, transparent: true, depthWrite: false });
    this.addGrid(); this.addDust(); this.addMarkers();
    this.globe.quaternion.copy(this.orientation(19, 126));
    this.raycaster = new THREE.Raycaster(); this.pointer = new THREE.Vector2();
    this.resizeObserver = new ResizeObserver(() => this.resize()); this.resizeObserver.observe(container); this.resize();
    const options = { signal: this.abort.signal };
    canvas.addEventListener('pointerdown', e => { if (this.flight) return; this.focusTarget = null; this.drag = { x: e.clientX, y: e.clientY, startX: e.clientX, startY: e.clientY }; this.velocity.set(0, 0); canvas.setPointerCapture(e.pointerId); }, options);
    canvas.addEventListener('pointermove', e => {
      if (this.flight) return;
      if (this.drag) {
        const dx = e.clientX - this.drag.x, dy = e.clientY - this.drag.y;
        this.rotate(dx * .005, dy * .005); this.velocity.set(dx * .19, dy * .19);
        this.drag.x = e.clientX; this.drag.y = e.clientY;
        this.onHover(null);
      } else { const hit = this.pick(e); this.onHover(hit?.id || null); canvas.style.cursor = hit ? 'pointer' : 'grab'; }
    }, options);
    canvas.addEventListener('pointerup', e => {
      if (!this.drag) return;
      const moved = Math.hypot(e.clientX - this.drag.startX, e.clientY - this.drag.startY);
      this.drag = null;
      if (moved < 5) { const hit = this.pick(e); if (hit) this.onPick(hit.id); }
    }, options);
    canvas.addEventListener('pointercancel', () => { this.drag = null; this.velocity.set(0, 0); }, options);
    canvas.addEventListener('pointerleave', () => this.onHover(null), options);
    canvas.addEventListener('wheel', e => { e.preventDefault(); if (!this.flight) this.distance = THREE.MathUtils.clamp(this.distance + e.deltaY * .003, 6.3, 11); }, { ...options, passive: false });
    canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); this.onError('地球渲染中断，请重试加载。'); }, options);
    this.previous = performance.now(); this.lastStats = this.previous;
    this.renderer.setAnimationLoop(now => this.render(now));
  }
  orientation(lat, lng) { return new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(...latLngToXYZ(lat, lng)), Z_AXIS); }
  async load() {
    const response = await fetch('/globe/land-points.bin', { signal: this.abort.signal });
    if (!response.ok) throw new Error('地球陆地轮廓加载失败');
    const buffer = await response.arrayBuffer();
    if (this.disposed) return;
    if (!buffer.byteLength || buffer.byteLength % 12) throw new Error('地球点云格式错误');
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(buffer), 3));
    this.land = new THREE.Points(geometry, this.landMaterial); this.globe.add(this.land);
    this.count = geometry.attributes.position.count;
  }
  addGrid() {
    const vertices = [];
    const segment = (a, b) => { vertices.push(...a, ...b); };
    for (let lat = -60; lat <= 60; lat += 30) for (let lng = -180; lng < 180; lng += 3) segment(latLngToXYZ(lat, lng, RADIUS * 1.001), latLngToXYZ(lat, lng + 3, RADIUS * 1.001));
    for (let lng = -180; lng < 180; lng += 30) for (let lat = -90; lat < 90; lat += 3) segment(latLngToXYZ(lat, lng, RADIUS * 1.001), latLngToXYZ(lat + 3, lng, RADIUS * 1.001));
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    this.globe.add(new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: '#615774', transparent: true, opacity: .12, depthWrite: false })));
  }
  addDust() {
    let seed = 192;
    const rand = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    const points = [], stars = [];
    for (let i = 0; i < (this.coarse ? 180 : 650); i++) {
      const z = rand() * 2 - 1, a = rand() * Math.PI * 2, r = 2.53 + rand() * .7;
      points.push(Math.sqrt(1 - z * z) * Math.cos(a) * r, z * r, Math.sqrt(1 - z * z) * Math.sin(a) * r);
    }
    const dustGeo = new THREE.BufferGeometry(); dustGeo.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
    this.dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({ color: '#8052ff', size: .013, transparent: true, opacity: .38, depthWrite: false })); this.scene.add(this.dust);
    for (let i = 0; i < 450; i++) stars.push((rand() - .5) * 26, (rand() - .5) * 18, -4 - rand() * 8);
    const starGeo = new THREE.BufferGeometry(); starGeo.setAttribute('position', new THREE.Float32BufferAttribute(stars, 3));
    this.stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: '#ffb829', size: .016, transparent: true, opacity: .38, depthWrite: false })); this.scene.add(this.stars);
  }
  addMarkers() {
    this.markers = LOCATIONS.map(location => {
      const anchor = new THREE.Group(); anchor.position.set(...latLngToXYZ(location.lat, location.lng, RADIUS * 1.006));
      anchor.quaternion.setFromUnitVectors(Z_AXIS, anchor.position.clone().normalize());
      const core = new THREE.Mesh(new THREE.SphereGeometry(.027, 12, 10), new THREE.MeshBasicMaterial({ color: '#ffb829' }));
      const ring = new THREE.Mesh(new THREE.RingGeometry(.06, .07, 48), new THREE.MeshBasicMaterial({ color: '#8052ff', side: THREE.DoubleSide, transparent: true, opacity: .7, depthWrite: false }));
      const aura = new THREE.Mesh(new THREE.RingGeometry(.095, .098, 48), new THREE.MeshBasicMaterial({ color: '#8052ff', side: THREE.DoubleSide, transparent: true, opacity: .4, depthWrite: false }));
      anchor.add(core, ring, aura); this.globe.add(anchor);
      const hit = new THREE.Mesh(new THREE.SphereGeometry(.12, 10, 8), new THREE.MeshBasicMaterial({ visible: false }));
      anchor.add(hit); hit.userData.location = location;
      return { location, anchor, core, ring, aura, hit, visible: true };
    });
  }
  setSelection(id, recommendedId) { this.selectedId = id; this.recommendedId = recommendedId; }
  focus(id) {
    const location = LOCATIONS.find(l => l.id === id); if (!location || this.flight) return;
    this.focusTarget = this.orientation(location.lat - 3, location.lng - 5);
    this.velocity.set(0, 0);
    if (this.reduced) { this.globe.quaternion.copy(this.focusTarget); this.focusTarget = null; }
  }
  resetCamera() { this.distance = 8.1; this.velocity.set(0, 0); this.focusTarget = this.orientation(19, 126); }
  setDensity(value) { if (this.land) this.land.geometry.setDrawRange(0, Math.round(this.count * value)); }
  rotate(x, y) {
    this.globe.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), x));
    this.globe.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), y));
  }
  pick(event) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    return this.raycaster.intersectObjects(this.markers.filter(m => m.visible).map(m => m.hit), false)[0]?.object.userData.location;
  }
  flyTo(id) {
    const location = LOCATIONS.find(l => l.id === id); if (!location || this.flight) return Promise.resolve(false);
    this.focusTarget = null; this.drag = null; this.velocity.set(0, 0);
    return new Promise(resolve => { this.flight = { elapsed: 0, duration: this.reduced ? .3 : 2.5, start: this.globe.quaternion.clone(), end: this.orientation(location.lat, location.lng), distance: this.distance, resolve }; });
  }
  cancelFlight() { this.flight?.resolve(false); this.flight = null; this.uniforms.uFlight.value = 0; this.onFlight(0); this.distance = 8.1; }
  resize() {
    const rect = this.container.getBoundingClientRect(); this.width = rect.width; this.height = rect.height;
    this.renderer.setSize(rect.width, rect.height, false); this.camera.aspect = rect.width / Math.max(1, rect.height); this.camera.updateProjectionMatrix();
  }
  render(now) {
    const dt = Math.min((now - this.previous) / 1000, .05); this.previous = now;
    if (document.hidden) return;
    const chaos = 1 - this.state.coherence;
    if (this.active && !this.reduced) { this.time += dt; this.phase += dt * this.state.HR / 60 * Math.PI * 2; }
    if (this.flight) {
      const flight = this.flight; flight.elapsed += dt;
      const t = Math.min(1, flight.elapsed / flight.duration), turn = Math.min(1, t / .65), zoom = Math.max(0, (t - .24) / .76);
      this.globe.quaternion.slerpQuaternions(flight.start, flight.end, turn * turn * (3 - 2 * turn));
      this.distance = THREE.MathUtils.lerp(flight.distance, 2.52, zoom * zoom * zoom);
      this.uniforms.uFlight.value = Math.max(0, (t - .65) / .35); this.onFlight(t);
      if (t >= 1) { this.flight = null; flight.resolve(true); }
    } else if (this.focusTarget) {
      this.globe.quaternion.slerp(this.focusTarget, 1 - Math.exp(-dt * 5));
      if (this.globe.quaternion.angleTo(this.focusTarget) < .001) this.focusTarget = null;
    } else if (!this.drag && !this.hovering && this.active && !this.reduced) {
      this.rotate(this.velocity.x * dt + (this.coarse ? 0 : .006 + chaos * .018) * dt, this.velocity.y * dt);
      this.velocity.multiplyScalar(Math.exp(-dt * 4));
    }
    this.camera.position.z = this.distance;
    this.uniforms.uTime.value = this.time; this.uniforms.uChaos.value = chaos;
    this.atmosphere.material.uniforms.uCalm.value = this.state.coherence;
    this.atmosphere.scale.setScalar(1 + (this.reduced ? 0 : Math.sin(this.time * (1 + chaos * 3)) * chaos * .004));
    this.dust.scale.setScalar(1 + chaos * .3 + Math.sin(this.phase) * .004);
    this.dust.rotation.y = this.time * (.012 + chaos * .12); this.dust.rotation.z = Math.sin(this.time * .12) * chaos * .08;
    this.scene.updateMatrixWorld(true); this.camera.updateMatrixWorld(true);
    this.onMarkers(this.markers.map(marker => {
      const pos = marker.anchor.getWorldPosition(new THREE.Vector3());
      marker.visible = pos.clone().normalize().dot(this.camera.position.clone().sub(pos).normalize()) > .02;
      const screen = pos.project(this.camera);
      const selected = marker.location.id === this.selectedId, top = marker.location.id === this.recommendedId;
      const pulse = this.reduced ? 1 : 1 + (Math.sin(this.phase * (.4 + chaos * .4)) + 1) * (top ? .28 : .1);
      marker.ring.scale.setScalar(selected ? 1.4 : 1); marker.aura.scale.setScalar(pulse);
      marker.core.material.color.set(selected ? '#ffffff' : top ? '#ffb829' : '#8052ff');
      return { id: marker.location.id, x: (screen.x + 1) / 2 * this.width, y: (1 - screen.y) / 2 * this.height, visible: marker.visible && screen.z < 1 && !this.flight };
    }));
    this.renderer.render(this.scene, this.camera);
    this.frames++;
    if (now - this.lastStats > 1000) { this.onStats({ fps: Math.round(this.frames * 1000 / (now - this.lastStats)), points: this.count || 0 }); this.frames = 0; this.lastStats = now; }
  }
  dispose() {
    this.disposed = true; this.cancelFlight(); this.abort.abort(); this.resizeObserver.disconnect(); this.renderer.setAnimationLoop(null);
    const geometries = new Set(), materials = new Set();
    this.scene.traverse(object => { if (object.geometry) geometries.add(object.geometry); if (object.material) materials.add(object.material); });
    materials.add(this.landMaterial); geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose());
    this.renderer.dispose(); this.renderer.forceContextLoss(); this.renderer.domElement.remove();
  }
}
