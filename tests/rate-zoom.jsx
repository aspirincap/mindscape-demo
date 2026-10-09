// Test-only: a real pinch frame from the user's LOCAL recording is translated
// to exercise the camera/MediaPipe/render pipeline. This is synthesized motion,
// not a claim that the user performed the new held gesture in the original clip.
import React,{useEffect,useRef,useState}from'react';import{createRoot}from'react-dom/client';
import{GestureControls}from'../src/GestureControls.jsx';import{WorldRenderer}from'../src/renderer.js';import'../src/styles.css';
const camera=document.createElement('canvas');camera.width=640;camera.height=360;const ctx=camera.getContext('2d');
let source=null,dy=0,track,phase='blank',running=false,start=0,rows=[],samples=[],freeze=false;
const imageAt=async time=>{const v=document.createElement('video');v.src='/artifacts/recording-test/hand-recording.mp4';v.muted=true;v.preload='auto';await new Promise((r,j)=>{v.onloadeddata=r;v.onerror=j;});await new Promise(r=>{v.onseeked=r;v.currentTime=time;});return createImageBitmap(v);};
const frames=Promise.all([imageAt(8.1),imageAt(2.2)]);
setInterval(()=>{if(freeze)return;ctx.fillStyle='#fff';ctx.fillRect(0,0,640,360);if(source)ctx.drawImage(source,0,dy,640,360);},1000/30);
Object.defineProperty(navigator.mediaDevices,'getUserMedia',{configurable:true,value:async()=>{const stream=camera.captureStream(24);track=stream.getVideoTracks()[0];return stream;}});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function Harness(){const scene=useRef(null),engine=useRef(null);const[ready,setReady]=useState(false),[paused,setPaused]=useState(false),[done,setDone]=useState(false),[info,setInfo]=useState('准备中'),[mounted,setMounted]=useState(true);
useEffect(()=>{const r=new WorldRenderer(scene.current,()=>{},e=>setInfo(e));engine.current=r;const apply=r.applyGesture.bind(r);r.applyGesture=(command,timestamp)=>{apply(command,timestamp);if(running)rows.push({phase,time:(performance.now()-start)/1000,command,orbit:{...r.orbit}});};r.loadWorld('eiffel').then(()=>{r.state={coherence:1,attention:.58,HR:72};r.transition=0;setReady(true);});const timer=setInterval(()=>{const entry={phase,time:(performance.now()-start)/1000,mode:r.gesture.mode,rate:r.gesture.zoomRate||0,zoom:r.orbit.zoom,camera:track?.readyState||'off'};if(running)samples.push(entry);setInfo(JSON.stringify(entry));},50);return()=>{clearInterval(timer);r.dispose();};},[]);
const run=async()=>{if(running)return;const[pinch,open]=await frames;rows=[];samples=[];source=null;phase='blank';running=true;setDone(false);start=performance.now();engine.current.resetCamera();await sleep(1000);
 const hold=async(name,image,offset,ms)=>{phase=name;source=image;dy=offset;await sleep(ms);};
 const ramp=async(to)=>{phase='transition';const from=dy;for(let i=1;i<=14;i++){dy=from+(to-from)*i/14;await sleep(50);}};
 await hold('neutral',pinch,0,1300);await ramp(-30);await hold('zoom-in-10s',pinch,-30,10000);await ramp(0);await hold('center-stop',pinch,0,1500);await ramp(30);await hold('zoom-out-10s',pinch,30,10000);
 await hold('release',open,0,1500);await hold('re-pinch-new-origin',pinch,15,1800);await hold('tracking-loss',null,0,800);await hold('safety-neutral',pinch,0,1000);await ramp(-30);await hold('before-pause',pinch,-30,1000);phase='paused';setPaused(true);await sleep(600);phase='resume-neutral';setPaused(false);await sleep(800);await ramp(-60);await hold('before-freeze',pinch,-60,1000);phase='frozen-video';freeze=true;await sleep(900);freeze=false;await hold('recover-fresh-anchor',pinch,-60,1000);await hold('final-no-hand',null,0,500);running=false;phase='DONE';setDone(true);};
return <main style={{padding:24}}><h1>持续缩放 · 正式组件测试</h1><p>本机真实捏合画面 + 合成上下位移；未上传视频，未访问硬件摄像头。先开启手势，模型就绪后开始。</p><div style={{display:'flex',gap:24,margin:'20px 0'}}><button onClick={run}>运行完整持续缩放验收</button><button onClick={()=>setPaused(v=>!v)}>{paused?'继续测试':'暂停测试'}</button><button onClick={()=>setMounted(false)}>卸载组件</button></div><pre id="rate-status">{info}</pre><p id="rate-done">{done?'DONE':'等待测试'}</p><div style={{height:480,position:'relative'}}><div ref={scene} style={{position:'absolute',inset:0}}/>{mounted&&<GestureControls engine={engine} paused={paused} world="eiffel" ready={ready}/>}</div><details><summary>本机验收记录</summary><pre id="rate-records">{done?JSON.stringify({rows,samples}):''}</pre></details></main>;
}
createRoot(document.querySelector('#root')).render(<Harness/>);
