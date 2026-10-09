import { GESTURE_MAX_AGE_MS } from './gestures.mjs';

export const ZOOM_LIMITS = Object.freeze({ min:-16, max:45 });
export const MAX_ZOOM_LOG_SPEED = .32;

// Renderer-clock integration decouples smooth motion from inference Hz.
// Never replay a suspended frame's elapsed time or extrapolate stale input.
export function integrateGestureZoom(zoom,gesture,now,dt,baseDistance=29) {
  if(gesture?.mode!=='zoom'||!Number.isFinite(gesture.zoomRate)||now-gesture.time>GESTURE_MAX_AGE_MS||now<gesture.time||dt<0||dt>.1)return zoom;
  const rate=Math.min(1,Math.max(-1,gesture.zoomRate));
  const distance=Math.max(1,baseDistance+zoom)*Math.exp(-rate*MAX_ZOOM_LOG_SPEED*dt);
  return Math.min(ZOOM_LIMITS.max,Math.max(ZOOM_LIMITS.min,distance-baseDistance));
}
