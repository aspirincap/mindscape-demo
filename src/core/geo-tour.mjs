import { clamp, sampleElevation } from './geo-navigation.mjs';
import { VISUAL_PRESETS, VISUAL_RANGES, normalizeVisual, smoothVisual } from './visual-style.mjs';

// Camera routes, in the existing local metre coordinate systems. No source geometry is altered.
export const TOUR_ROUTES = {
  fuji: { name: '雪峰与湖泊', duration: 300, chapters: ['南麓起飞', '掠过火山口', '河口湖上空', '青木原回旋'],
    knots: [[800,14200,3600],[6500,10300,1600],[4800,5800,900],[400,5500,620],[-3200,3400,800],[-2400,-1800,1050],[3100,-9900,1100],[-2900,-10400,1050],[-7900,-6200,1200],[-7100,1800,1600],[-4200,10400,2500]] },
  'grand-canyon': { name: '峡谷逐风', duration: 240, chapters: ['南缘展翼', '飞入峡谷腹地', '沿河谷滑翔', '越过台地回旋'],
    knots: [[600,6400,700],[2200,3900,650],[2000,1000,750],[1100,-1200,820],[-1800,-1400,780],[-4800,-600,730],[-6700,1300,680],[-5000,4100,720],[-2800,6500,800]] },
};
const mod = (v, n) => { const r = v % n; return r < 0 ? r + n : r; };
const mix = (a, b, t) => a + (b - a) * t;
const ease = t => { t = clamp(t, 0, 1); return t * t * t * (10 + t * (-15 + 6 * t)); };
const length = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
function spline(knots, t) {
  const n = knots.length, k = mod(t, 1) * n, i = Math.floor(k), f = k - i;
  return knots[i].map((_, axis) => {
    const a = knots[mod(i - 1, n)][axis], b = knots[i][axis], c = knots[(i + 1) % n][axis], d = knots[(i + 2) % n][axis];
    return .5 * ((2 * b) + (-a + c) * f + (2 * a - 5 * b + 4 * c - d) * f * f + (-a + 3 * b - 3 * c + d) * f * f * f);
  });
}

export function buildTour(meta, heights) {
  const config = TOUR_ROUTES[meta.id]; if (!config) throw new Error('No geographic tour');
  const count = 2048, ground = (x, z) => sampleElevation(meta, heights, x, z);
  const points = Array.from({ length: count }, (_, i) => {
    const [x, z, clearance] = spline(config.knots, i / count);
    // Look ahead to neighbouring terrain before climbing; never fly through a ridge.
    let floor = ground(x, z);
    for (let a = 0; a < 8; a++) floor = Math.max(floor, ground(x + Math.cos(a * Math.PI / 4) * 500, z + Math.sin(a * Math.PI / 4) * 500));
    return [x, floor + clearance, z];
  });
  const safeY = points.map(p => p[1]);
  // A smooth upper envelope anticipates climbs instead of snapping upward at DEM cells.
  for (let i = 0; i < count; i++) for (let d = -90; d <= 90; d++) {
    const j = mod(i + d, count), horizontal = Math.hypot(points[i][0] - points[j][0], points[i][2] - points[j][2]);
    safeY[i] = Math.max(safeY[i], points[j][1] - horizontal * .3);
  }
  for (let i = 0; i < count; i++) {
    let sum = 0; for (let d = -24; d <= 24; d++) sum += safeY[mod(i + d, count)];
    points[i][1] = sum / 49 + 90;
  }
  points.push([...points[0]]);
  const distances = [0];
  for (let i = 1; i <= count; i++) distances[i] = distances[i - 1] + length(points[i - 1], points[i]);
  const total = distances[count];
  const at = distance => {
    const d = mod(distance, total); let lo = 0, hi = count;
    while (lo + 1 < hi) { const mid = (lo + hi) >> 1; if (distances[mid] <= d) lo = mid; else hi = mid; }
    const t = (d - distances[lo]) / (distances[lo + 1] - distances[lo]);
    return points[lo].map((v, a) => mix(v, points[lo + 1][a], t));
  };
  return { ...config, total, at, ground, pose(seconds) {
    const distance = mod(seconds / config.duration, 1) * total, position = at(distance);
    const before = at(distance - 450), ahead = at(distance + 1400), farther = at(distance + 2100);
    const dx = ahead[0] - position[0], dz = ahead[2] - position[2], scale = 1800 / Math.max(1, Math.hypot(dx, dz));
    const look = [position[0] + dx * scale, position[1] - 700, position[2] + dz * scale];
    // Establish the landmark before settling into the forward gliding view. Symmetric at the loop seam.
    const progress = mod(seconds / config.duration, 1), opening = 1 - ease(Math.min(progress, 1 - progress) / .085);
    const landmark = meta.pois.find(p => p.id === (meta.id === 'fuji' ? 'summit' : 'phantom'));
    const focal = [landmark.x, ground(landmark.x, landmark.z) + 120, landmark.z];
    for (let i = 0; i < 3; i++) look[i] = mix(look[i], focal[i], opening);
    const h1 = Math.atan2(position[0] - before[0], position[2] - before[2]), h2 = Math.atan2(farther[0] - ahead[0], farther[2] - ahead[2]);
    const turn = Math.atan2(Math.sin(h2 - h1), Math.cos(h2 - h1));
    return { position, look, bank: clamp(-turn * .13, -.085, .085) };
  } };
}

export class TourPlayback {
  constructor(route, reduced = false) { this.route = route; this.time = 0; this.status = reduced ? 'paused' : 'playing'; this.autoVisual = true; }
  advance(dt, active = true, hidden = false) {
    if (this.status === 'playing' && active && !hidden && dt >= 0 && dt <= .25) this.time = mod(this.time + dt, this.route.duration);
    return this.route.pose(this.time);
  }
  pause() { if (this.status === 'playing') this.status = 'paused'; }
  resume() { this.status = 'playing'; }
  manual() { this.status = 'manual'; }
  restart() { this.time = 0; this.status = 'playing'; this.autoVisual = true; }
  snapshot() { return { status: this.status, progress: this.time / this.route.duration, elapsed: this.time, duration: this.route.duration, name: this.route.name, chapter: this.route.chapters[Math.min(3, Math.floor(this.time / this.route.duration * 4))], autoVisual: this.autoVisual }; }
}

export function tourVisual(progress) {
  // Long quiet opening, then dissolve through light and colour, returning to clarity at the loop seam.
  const stops = [[0, 'lucid'], [.13, 'lucid'], [.38, 'luminous'], [.66, 'dream'], [.88, 'lucid'], [1, 'lucid']];
  const t = clamp(progress, 0, 1), end = stops.findIndex((s, i) => i > 0 && t <= s[0]);
  const a = stops[Math.max(0, end - 1)], b = stops[Math.max(1, end)], ratio = ease((t - a[0]) / (b[0] - a[0]));
  const first = VISUAL_PRESETS[a[1]], second = VISUAL_PRESETS[b[1]], v = { mode: 'cinematic', palette: first.palette };
  for (const key of Object.keys(VISUAL_RANGES)) v[key] = mix(first[key], second[key], ratio);
  v.paletteMix = mix({ lucid: 0, luminous: 1, dream: 2 }[a[1]], { lucid: 0, luminous: 1, dream: 2 }[b[1]], ratio);
  // Keep the underlying landform readable during flight; accents carry most of the motion.
  v.dispersion = Math.min(v.dispersion, .06);
  return v;
}
export function blendVisual(current, target, dt) {
  const out = { ...target };
  for (const key of Object.keys(VISUAL_RANGES)) out[key] = smoothVisual(current[key], target[key], dt, .9);
  const palette = v => v.paletteMix ?? { natural: 0, aurora: 1, ocean: 2 }[v.palette];
  out.paletteMix = smoothVisual(palette(current), palette(target), dt, 1.2);
  return out;
}
export const clearGeoVisual = () => normalizeVisual({ ...VISUAL_PRESETS.lucid, mode: 'cinematic' });

// Same broad rounded mask as the vertex shader, useful for deterministic extent checks.
export function terrainEdgeOpacity(x, z, width, depth) {
  const px = Math.abs(x) / (width * .5), pz = Math.abs(z) / (depth * .5);
  const radius = (px ** 4 + pz ** 4) ** .25;
  const t = clamp((radius - .70) / .29, 0, 1);
  return 1 - t * t * (3 - 2 * t);
}
