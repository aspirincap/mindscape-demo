// Dev-only integration harness. Never included in dist or linked by the app.
import React, { useRef, useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { GestureControls } from '../src/GestureControls.jsx';
import '../src/styles.css';

let rejectCamera = false, track;
const camera = document.createElement('canvas'); camera.width = 640; camera.height = 480;
const image = new Image(); image.src = '/tests/fixtures/hands.jpg';
setInterval(() => { const ctx=camera.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,640,480);if(image.complete&&image.naturalWidth)ctx.drawImage(image,0,0,640,480); },100);
Object.defineProperty(navigator.mediaDevices, 'getUserMedia', { configurable: true, value: async () => {
  if (rejectCamera) throw new DOMException('Test denied', 'NotAllowedError');
  const stream = camera.captureStream(10); track = stream.getVideoTracks()[0]; return stream;
}});
function Harness() {
  const [mounted,setMounted]=useState(true),[paused,setPaused]=useState(false),[info,setInfo]=useState('尚未开启');
  const engine=useRef({inputRevision:0,command:null,applyGesture(command){this.command=command;},clearGesture(){this.command=null;}});
  useEffect(()=>{const timer=setInterval(()=>setInfo(JSON.stringify({camera:track?.readyState||'off',mode:engine.current.command?.mode||'idle',hands:engine.current.command?.hands||0,paused},null,2)),250);return()=>clearInterval(timer);},[paused]);
  return <div style={{padding:30,minHeight:'100vh'}}><h1>真实组件 + 公开图片视频流</h1><p>摄像头替身仅在本测试页生效，不请求硬件访问。</p><div style={{display:'flex',gap:24,margin:'20px 0'}}><button onClick={()=>setPaused(v=>!v)}>{paused?'继续测试':'暂停测试'}</button><button onClick={()=>setMounted(v=>!v)}>{mounted?'模拟离开场景':'重新进入场景'}</button><button onClick={()=>{rejectCamera=true;setInfo('已设置：下一次拒绝授权');}}>模拟拒绝授权</button></div><pre role="status">{info}</pre>{mounted&&<GestureControls engine={engine} paused={paused} world="abyss" ready={true}/>}</div>;
}
createRoot(document.querySelector('#root')).render(<Harness/>);
