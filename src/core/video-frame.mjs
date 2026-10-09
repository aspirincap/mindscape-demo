// Fit within the inference budget without changing the camera's aspect ratio.
export function gestureFrameSize(width, height) {
  if (!(width > 0 && height > 0)) return { width: 640, height: 480 };
  const scale = Math.min(640 / width, 480 / height, 1);
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}
