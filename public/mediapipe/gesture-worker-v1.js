/* MediaPipe runs only in this dedicated, same-origin worker. No frame is uploaded. */
importScripts('/mediapipe/1.1.0/vision_bundle.js');
let recognizer;
self.onmessage = async ({ data }) => {
  try {
    if (data.type === 'init') {
      const files = await Vision.FilesetResolver.forVisionTasks('/mediapipe/1.1.0');
      // Offscreen GPU inference is isolated from the UI; cadence is bounded by the caller.
      const create = delegate => Vision.GestureRecognizer.createFromOptions(files, {
        baseOptions: { modelAssetPath: '/mediapipe/gesture-recognizer-v1.task', delegate },
        canvas: new OffscreenCanvas(640, 480), runningMode: 'VIDEO', numHands: 1,
        minHandDetectionConfidence: .6, minHandPresenceConfidence: .6, minTrackingConfidence: .6,
      });
      let delegate = 'GPU';
      try { recognizer = await create(delegate); }
      catch { delegate = 'CPU'; recognizer = await create(delegate); }
      const warmup = new OffscreenCanvas(64, 64);
      warmup.getContext('2d').fillRect(0, 0, 64, 64);
      recognizer.recognizeForVideo(warmup, 0);
      self.postMessage({ type: 'ready', delegate });
    } else if (data.type === 'frame') {
      const started = performance.now();
      const result = recognizer.recognizeForVideo(data.bitmap, data.timestamp);
      self.postMessage({ type: 'result', result: { landmarks: result.landmarks, gestures: result.gestures }, timestamp: data.timestamp, duration: performance.now() - started });
    }
  } catch (error) {
    self.postMessage({ type: 'error', message: error instanceof Error ? error.message : '识别器启动失败' });
  } finally { data.bitmap?.close(); }
};
