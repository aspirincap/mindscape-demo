import { GESTURE_MAX_AGE_MS } from './gestures.mjs';
export const GEO_WORLDS = new Set(['fuji', 'grand-canyon']);
export const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
export function sampleElevation(meta, heights, x, z) {
  const n=meta.heightGrid.size;
  const u=clamp((x/meta.width+.5)*(n-1),0,n-1),v=clamp((z/meta.depth+.5)*(n-1),0,n-1);
  const ix=Math.min(n-2,Math.floor(u)),iz=Math.min(n-2,Math.floor(v)),fx=u-ix,fz=v-iz;
  const a=heights[iz*n+ix]*(1-fx)+heights[iz*n+ix+1]*fx;
  const b=heights[(iz+1)*n+ix]*(1-fx)+heights[(iz+1)*n+ix+1]*fx;
  return a*(1-fz)+b*fz;
}
export function panView(view, dx, dz, meta) {
  const c=Math.cos(view.yaw),s=Math.sin(view.yaw);
  view.x=clamp(view.x+dx*c+dz*s,-meta.width*.49,meta.width*.49);
  view.z=clamp(view.z-dx*s+dz*c,-meta.depth*.49,meta.depth*.49);
}
export function zoomView(view, logarithmicDelta, meta) {
  if(!Number.isFinite(logarithmicDelta))return;
  view.distance=clamp(view.distance*Math.exp(clamp(logarithmicDelta,-1,1)),120,Math.max(meta.width,meta.depth)*2);
}
export function gestureZoom(view, gesture, now, elapsed, meta) {
  if(gesture?.mode!=='zoom'||!Number.isFinite(gesture.zoomRate)||elapsed<0||elapsed>.25||now<gesture.time||now-gesture.time>GESTURE_MAX_AGE_MS)return;
  zoomView(view,-clamp(gesture.zoomRate,-1,1)*.65*elapsed,meta);
}
