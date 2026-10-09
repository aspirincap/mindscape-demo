// Local-only video replaces the hardware camera. Production component, worker
// and renderer are imported unchanged; no permission request or upload occurs.
import React,{useEffect,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {GestureControls} from '../src/GestureControls.jsx';
import {WorldRenderer} from '../src/renderer.js';
import '../src/styles.css';
const input=document.createElement('video');input.src='/artifacts/recording-test/hand-recording.mp4';input.muted=true;input.playsInline=true;input.preload='auto';
const source=document.createElement('canvas');source.width=640;source.height=360;
const ctx=source.getContext('2d');let track,recording=false,rows=[];
setInterval(()=>{ctx.fillStyle='white';ctx.fillRect(0,0,640,360);if(recording&&input.readyState>=2)ctx.drawImage(input,0,0,640,360);},1000/30);
Object.defineProperty(navigator.mediaDevices,'getUserMedia',{configurable:true,value:async()=>{const stream=source.captureStream(24);track=stream.getVideoTracks()[0];return stream;}});
function Harness(){const engine=useRef(null),scene=useRef(null);const[ready,setReady]=useState(false),[mounted,setMounted]=useState(true),[info,setInfo]=useState('未开始'),[finished,setFinished]=useState(false);
useEffect(()=>{const renderer=new WorldRenderer(scene.current,()=>{},message=>setInfo(message));engine.current=renderer;const apply=renderer.applyGesture.bind(renderer);renderer.applyGesture=(command,timestamp)=>{apply(command,timestamp);if(recording)rows.push({time:input.currentTime,command,orbit:{...renderer.orbit}});};renderer.loadWorld('eiffel').then(()=>{renderer.state={coherence:1,attention:.58,HR:72};renderer.transition=0;setReady(true);});const timer=setInterval(()=>setInfo(JSON.stringify({camera:track?.readyState||'off',videoTime:input.currentTime,commands:rows.length,mode:rows.at(-1)?.command.mode||'idle',orbit:renderer.orbit})),250);input.onended=()=>{recording=false;setFinished(true);};return()=>{clearInterval(timer);renderer.dispose();};},[]);
return <main style={{padding:30}}><h1>真实视频流 → 正式手势组件 → 点云镜头</h1><p>先开启手势，模型准备好后播放录屏。此页使用本机视频，不申请摄像头权限。</p><button onClick={async()=>{rows=[];setFinished(false);input.currentTime=0;recording=true;await input.play();}}>播放真人录屏</button><button style={{marginLeft:30}} onClick={()=>setMounted(false)}>卸载组件</button><pre id="component-status">{info}</pre><p id="component-result">{finished?'DONE':'等待完成'}</p><div style={{position:'relative',height:560}}><div ref={scene} style={{position:'absolute',inset:0}}/>{mounted&&<GestureControls engine={engine} paused={false} world="eiffel" ready={ready}/>}</div><details><summary>本机控制指令记录</summary><pre id="component-records">{finished?JSON.stringify(rows):''}</pre></details></main>;
}
createRoot(document.querySelector('#root')).render(<Harness/>);
