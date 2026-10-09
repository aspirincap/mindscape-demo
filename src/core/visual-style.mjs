const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
export const VISUAL_MODES = ['original', 'particles', 'cinematic'];
export const VISUAL_RANGES = {
  pointSize: [.5, 2], dispersion: [0, 1], flow: [0, 2], speed: [0, 1.5],
  recovery: [.15, 3], brightness: [.5, 2], saturation: [0, 1.6],
  bloom: [0, 1.4], trail: [0, 1.5], softness: [0, 1],
};
export const VISUAL_PRESETS = {
  lucid: { name: '清晰', note: '细腻轮廓 · 原生色彩', palette: 'natural', pointSize: .9, dispersion: 0, flow: .65, speed: .35, recovery: .9, brightness: 1.15, saturation: 1.05, bloom: .28, trail: .12, softness: .08 },
  luminous: { name: '流光', note: '冷暖交织 · 微光流动', palette: 'aurora', pointSize: 1.12, dispersion: 0, flow: 1, speed: .55, recovery: 1.1, brightness: 1.25, saturation: 1.1, bloom: .65, trail: .5, softness: .22 },
  dream: { name: '梦境', note: '轻柔漂散 · 蓝紫余辉', palette: 'ocean', pointSize: 1.2, dispersion: .16, flow: 1.35, speed: .4, recovery: 1.6, brightness: 1.15, saturation: 1.15, bloom: .85, trail: .85, softness: .45 },
};
export const DEFAULT_VISUAL = { ...VISUAL_PRESETS.luminous, mode: 'cinematic' };
export function normalizeVisual(value = {}) {
  const result = { ...DEFAULT_VISUAL };
  for (const [key, [min, max]] of Object.entries(VISUAL_RANGES)) {
    if (Number.isFinite(value[key])) result[key] = clamp(value[key], min, max);
  }
  result.mode = VISUAL_MODES.includes(value.mode) ? value.mode : DEFAULT_VISUAL.mode;
  result.palette = ['natural', 'aurora', 'ocean'].includes(value.palette) ? value.palette : DEFAULT_VISUAL.palette;
  return result;
}
export const smoothVisual = (current, target, dt, seconds) => current + (target - current) * (1 - Math.exp(-Math.max(0, dt) / Math.max(.05, seconds)));
export const feedbackDecay = (dt, halfLife) => halfLife > 0 ? Math.exp(-Math.LN2 * Math.max(0, dt) / halfLife) : 0;
export function dispersionTarget(coherence, visual) {
  if (visual.mode === 'original') return 0;
  return Math.max(visual.dispersion, Math.pow(clamp((.78 - coherence) / .78, 0, 1), 1.5));
}
