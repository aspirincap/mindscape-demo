import React, { memo, useEffect, useRef, useState } from 'react';
import { Hand } from '@phosphor-icons/react/dist/csr/Hand';
import { X } from '@phosphor-icons/react/dist/csr/X';
import { CircleNotch } from '@phosphor-icons/react/dist/csr/CircleNotch';
import { GestureController, GESTURE_MAX_AGE_MS } from './core/gestures.mjs';
import { ZOOM_LIMITS } from './core/gesture-zoom.mjs';
import { gestureFrameSize } from './core/video-frame.mjs';
import './gestures.css';

const LABELS = { idle: '将手放入画面', ready: '捏住进入缩放 · 张掌或握拳移动', rotate: '正在移动镜头', zoom: '捏合已锁定 · 中点暂停', pointer: '鼠标已接管 · 手移出画面后再放回' };
const EDGES = [[0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],[5,9],[9,10],[10,11],[11,12],[9,13],[13,14],[14,15],[15,16],[13,17],[0,17],[17,18],[18,19],[19,20]];
const cameraError = error => ['NotAllowedError', 'SecurityError'].includes(error?.name) ? '摄像头未获授权。可在地址栏开启权限后重试，或继续拖动场景。' : error?.name === 'NotFoundError' ? '未找到摄像头。你仍可拖动场景、滚轮缩放。' : error?.name === 'NotReadableError' ? '摄像头被占用，请关闭其他使用摄像头的应用后重试。' : '手势未能启动，请重试。你仍可使用鼠标或触摸控制。';

export const GestureControls = memo(function GestureControls({ engine, paused, world, ready }) {
  const [enabled, setEnabled] = useState(false);
  const [status, setStatus] = useState('off');
  const [error, setError] = useState('');
  const [inferenceMs, setInferenceMs] = useState(0);
  const [previewAspect, setPreviewAspect] = useState(4 / 3);
  const [zoomControl, setZoomControl] = useState(null);
  const video = useRef(null), overlay = useRef(null), suspended = useRef(paused);
  suspended.current = paused;
  useEffect(() => {
    if (!enabled) return;
    let disposed = false, stream, worker, timer, initTimer, frameTimer, videoCallback, cameraElement, frameSerial = 0, frameAspect = 4 / 3, busy = false, workerReady = false, lastFrame = -1, lastCapture = 0, lastResult = null, interval = 65, revision = engine.current?.inputRevision;
    const controller = new GestureController();
    const stopCamera = () => { if(videoCallback!==undefined)cameraElement?.cancelVideoFrameCallback?.(videoCallback);stream?.getTracks().forEach(track => track.stop()); if (video.current?.srcObject === stream) video.current.srcObject = null; };
    const clearControl = () => { controller.reset();lastResult=null;engine.current?.clearGesture?.();setZoomControl(null);overlay.current?.getContext('2d')?.clearRect(0, 0, 320, 240); };
    const fail = (message) => {
      if (disposed) return;
      clearTimeout(initTimer); clearTimeout(frameTimer); clearInterval(timer); worker?.terminate(); stopCamera(); clearControl();
      setError(message); setStatus('error');
    };
    const draw = (result,command) => {
      const canvas = overlay.current, context = canvas?.getContext('2d');
      if (!context) return;
      context.clearRect(0, 0, canvas.width, canvas.height);
      if(command.mode==='zoom'){
        const y=command.neutralY*240,band=command.deadzoneY*240;
        context.fillStyle='#8052ff38';context.fillRect(0,y-band,320,band*2);
        context.strokeStyle='#c3afff';context.lineWidth=1;context.setLineDash([5,5]);context.beginPath();context.moveTo(0,y);context.lineTo(320,y);context.stroke();context.setLineDash([]);
        context.fillStyle='#fff';context.font='12px system-ui';context.fillText('中点 · 停止',8,Math.max(15,y-6));
      }
      context.strokeStyle = '#8052ff'; context.fillStyle = '#ffb829'; context.lineWidth = 2;
      for (const hand of result.landmarks) {
        context.beginPath();
        for (const [a,b] of EDGES) { context.moveTo((1-hand[a].x)*320,hand[a].y*240); context.lineTo((1-hand[b].x)*320,hand[b].y*240); }
        context.stroke();
        for (const point of hand) { context.beginPath(); context.arc((1-point.x)*320,point.y*240,2.5,0,Math.PI*2); context.fill(); }
      }
    };
    const capture = async () => {
      if (disposed || !workerReady) return;
      if (document.hidden || suspended.current) { clearControl(); setStatus(document.hidden ? 'hidden' : 'paused'); return; }
      if(lastResult!==null&&performance.now()-lastResult>GESTURE_MAX_AGE_MS){clearControl();setStatus('idle');}
      if(busy)return;
      const element = video.current, now = performance.now();
      const frame=element?.requestVideoFrameCallback?frameSerial:element?.currentTime;
      if (!element || element.readyState < 2 || frame === lastFrame || now - lastCapture < interval) return;
      busy = true; lastFrame = frame; lastCapture = now;
      try {
        const size = gestureFrameSize(element.videoWidth, element.videoHeight);
        const bitmap = await createImageBitmap(element, { resizeWidth: size.width, resizeHeight: size.height });
        frameAspect = size.width / size.height;
        if (disposed) { bitmap.close(); return; }
        if (document.hidden || suspended.current) { bitmap.close(); busy = false; return; }
        frameTimer = setTimeout(() => fail('识别暂时无响应，请关闭手势后重试。'), 10000);
        worker.postMessage({ type: 'frame', bitmap, timestamp: now }, [bitmap]);
      } catch { busy = false; fail('无法读取摄像头画面，请重试或使用鼠标控制。'); }
    };
    const start = async () => {
      setStatus('permission'); setError('');
      if (!navigator.mediaDevices?.getUserMedia || !window.Worker || !window.OffscreenCanvas || !window.createImageBitmap) { fail('当前浏览器不支持手势识别。建议使用新版 Chrome，或继续用鼠标和触摸。'); return; }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 24, max: 30 } }, audio: false });
        if (disposed) { stopCamera(); return; }
        stream.getVideoTracks()[0].onended = () => fail('摄像头已断开，请重试连接。');
        video.current.srcObject = stream; await video.current.play();
        if (disposed) return;
        cameraElement=video.current;
        // Stream currentTime can advance without a newly decoded camera frame.
        // Presented-frame callbacks prevent replaying stale pixels as live input.
        if(cameraElement.requestVideoFrameCallback){const presented=()=>{if(disposed)return;frameSerial++;videoCallback=cameraElement.requestVideoFrameCallback(presented);};videoCallback=cameraElement.requestVideoFrameCallback(presented);}
        setStatus('loading');
        worker = new Worker('/mediapipe/gesture-worker-v1.js');
        worker.onerror = () => fail('手势模型加载失败，请检查网络后重试。');
        worker.onmessage = ({ data }) => {
          if (disposed) return;
          if (data.type === 'ready') { clearTimeout(initTimer); workerReady = true; setStatus('idle'); timer = setInterval(capture, 30); }
          else if (data.type === 'error') fail('手势识别暂不可用，请重试或使用鼠标控制。');
          else if (data.type === 'result') {
            clearTimeout(frameTimer); busy = false;
            if (document.hidden || suspended.current || performance.now() - data.timestamp > GESTURE_MAX_AGE_MS) { clearControl();setStatus(document.hidden?'hidden':suspended.current?'paused':'idle');return; }
            lastResult=data.timestamp;
            if (engine.current?.inputRevision !== revision) { controller.releaseToPointer(); revision = engine.current?.inputRevision; }
            const command = controller.update(data.result, data.timestamp, frameAspect);
            engine.current?.applyGesture?.(command,data.timestamp);
            const zoom=engine.current?.orbit?.zoom;
            setZoomControl(command.mode==='zoom'?{rate:command.zoomRate,limit:command.zoomRate>0&&zoom<=ZOOM_LIMITS.min+.02?'near':command.zoomRate<0&&zoom>=ZOOM_LIMITS.max-.02?'far':null}:null);
            draw(data.result,command);setStatus(command.mode);setInferenceMs(Math.round(data.duration));
            interval = Math.min(200, Math.max(65, data.duration * 1.2));
          }
        };
        initTimer = setTimeout(() => fail('模型加载超时，请检查网络后重试。'), 45000);
        worker.postMessage({ type: 'init' });
      } catch (reason) { fail(cameraError(reason)); }
    };
    const visibility = () => { clearControl(); if (document.hidden) setStatus('hidden'); };
    document.addEventListener('visibilitychange', visibility);
    start();
    return () => { disposed = true; clearTimeout(initTimer); clearTimeout(frameTimer); clearInterval(timer); worker?.terminate(); stopCamera(); clearControl(); document.removeEventListener('visibilitychange', visibility); };
  }, [enabled, engine, world]);

  const loading = ['permission', 'loading'].includes(status);
  const zoomLabel=zoomControl?.limit==='near'?'已到最近视角 · 下移可缩小':zoomControl?.limit==='far'?'已到最远视角 · 上移可放大':zoomControl?.rate>0?`持续放大 · ${Math.round(zoomControl.rate*100)}% 速度`:zoomControl?.rate<0?`持续缩小 · ${Math.round(-zoomControl.rate*100)}% 速度`:LABELS.zoom;
  const label = status === 'permission' ? '等待摄像头授权…' : status === 'loading' ? '正在加载手势模型…' : status === 'paused' ? '体验暂停 · 手势已暂停' : status === 'hidden' ? '页面隐藏 · 手势已暂停' : status === 'error' ? '手势暂不可用' : status==='zoom'?zoomLabel:LABELS[status];
  return <aside className={`gesture-panel ${enabled ? 'is-enabled' : ''}`} aria-label="手势控制">
    {!enabled ? <button className="gesture-enable" disabled={!ready} onClick={() => setEnabled(true)}><Hand size={18}/><span>开启手势<small>仅需一只手</small></span><span className="gesture-beta">CAMERA</span></button> : <>
      <div className="gesture-heading"><span><Hand size={15}/> 手势控制</span><button className="icon-button" aria-label="关闭手势与摄像头" onClick={() => { setEnabled(false); setStatus('off'); }}><X size={15}/></button></div>
      <div className="gesture-preview" style={{ aspectRatio: previewAspect }} hidden={status === 'error'}><video ref={video} muted playsInline aria-label="本地摄像头预览" onLoadedMetadata={event => { const element = event.currentTarget; if (element.videoHeight) setPreviewAspect(element.videoWidth / element.videoHeight); }}/><canvas ref={overlay} width="320" height="240" aria-hidden="true"/>{loading && <div className="gesture-loading"><CircleNotch size={21} className="spin"/></div>}</div>
      <p className="gesture-status" role="status"><i className={loading ? 'loading' : ''}/>{label}</p>
      {status==='zoom'&&zoomControl&&<div className="gesture-speed" aria-label="缩放速度"><div className="gesture-speed-track"><i/><b style={{left:`${50+zoomControl.rate*46}%`}}/></div><div><span>缩小</span><span>停止</span><span>放大</span></div></div>}
      {error ? <div className="gesture-error" role="alert"><p>{error}</p><button onClick={() => { setEnabled(false); setStatus('off'); }}>关闭并重试</button></div> : <div className="gesture-instructions"><span>张掌 / 握拳移动 · 移动镜头</span><span>捏住后上移放大 · 下移缩小</span><span>保持位置持续缩放 · 松开即停</span><span>回到中点暂停 · 其余手指自然舒展</span></div>}
      <p className="gesture-privacy">画面仅在本机处理，不上传{inferenceMs > 0 && !error ? <small>{inferenceMs} ms / 帧</small> : null}</p>
    </>}
  </aside>;
});
