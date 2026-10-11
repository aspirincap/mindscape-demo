import { sceneAsset } from './scene-assets.mjs';
import { SCENE_PLACES } from './scene-places.mjs';
import { tourVisual, TourPlayback } from './geo-tour.mjs';
import { normalizeVisual, VISUAL_PRESETS } from './visual-style.mjs';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const clearSceneVisual = () => normalizeVisual({ ...VISUAL_PRESETS.lucid, mode: 'cinematic' });
export function sceneLimits(asset) {
  const center = asset.camera.orbit_x, yaw = asset.safeYaw * Math.PI / 180;
  return { minX: center-yaw, maxX: center+yaw, minY: -.65, maxY: .65, minZoom: -3.5, maxZoom: .6 };
}
export function clampSceneOrbit(asset, orbit) {
  const b = sceneLimits(asset);
  return { x: clamp(orbit.x,b.minX,b.maxX), y: clamp(orbit.y,b.minY,b.maxY), zoom: clamp(orbit.zoom,b.minZoom,b.maxZoom) };
}
export function buildSceneTour(id) {
  const asset = sceneAsset(id);
  if (!asset) throw new Error('Unknown scene');
  const place = SCENE_PLACES[Number(id.slice(-2))-1];
  return {
    duration: place[9], name: `${place[3]} · 微光导览`,
    chapters: ['初见风景', '微光苏醒', '色彩漫游', '归于清晰'],
    pose(seconds) {
      const t = ((seconds / this.duration) % 1 + 1) % 1;
      const envelope = Math.sin(Math.PI*t)**2;
      // Stay close to the original capture; there is no reliable reverse side.
      return clampSceneOrbit(asset, {
        x: asset.camera.orbit_x + Math.sin(t*Math.PI*2) * envelope * asset.safeYaw*Math.PI/180*.68,
        y: Math.sin(t*Math.PI*4) * envelope * .32,
        zoom: -1.65 * envelope,
      });
    },
  };
}
export const scenePlayback = (id, reduced=false) => new TourPlayback(buildSceneTour(id), reduced);
export function sceneTourVisual(progress) {
  const visual = tourVisual(progress), envelope = Math.sin(Math.PI*clamp(progress,0,1))**2;
  // Quiet breathing of the surface, rather than scattering an image reconstruction.
  visual.dispersion = .075 * envelope;
  visual.softness = Math.min(.2,visual.softness);
  visual.bloom = Math.min(.6,visual.bloom);
  visual.trail = Math.min(.55,visual.trail);
  return visual;
}
