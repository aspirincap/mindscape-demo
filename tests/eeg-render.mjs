import {chromium} from 'playwright';
import {existsSync,readdirSync} from 'node:fs';
import {mkdir,writeFile} from 'node:fs/promises';
import {homedir} from 'node:os';import {join} from 'node:path';import assert from 'node:assert/strict';
const cache=join(homedir(),'Library/Caches/ms-playwright');const fallback=existsSync(cache)?readdirSync(cache).filter(n=>/^chromium_headless_shell-\d+$/.test(n)).sort().reverse().map(n=>join(cache,n,`chrome-headless-shell-mac-${process.arch==='arm64'?'arm64':'x64'}`,'chrome-headless-shell')).find(existsSync):undefined;
const browser=await chromium.launch({headless:true,executablePath:existsSync(chromium.executablePath())?undefined:fallback});
const base=process.env.GEO_TEST_URL||'http://127.0.0.1:5174';const results=[],errors=[];await mkdir('artifacts/eeg',{recursive:true});
try {
 const page=await browser.newPage({viewport:{width:1000,height:700}});page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 for (const world of ['fuji','grand-canyon','abyss']) {
  await page.goto(`${base}/tests/eeg-render-lab.html?world=${world}`);await page.waitForFunction(()=>window.ready&&window.stats?.points>1000,null,{timeout:60000});await page.waitForTimeout(2500);
  const result=await page.evaluate(async()=>{
   const {DEFAULT_VISUAL}=await import('/src/core/visual-style.mjs');const check=(v,m)=>{if(!v)throw new Error(m);};
   engine.renderer.setAnimationLoop(null);if(engine.tiles)engine.tiles.update=()=>{};engine.lastStats=Number.MAX_SAFE_INTEGER;engine.active=true;
   const gl=engine.renderer.getContext();let now=performance.now();const tick=()=>{now+=1000/60;engine.render(now);gl.finish();};
   engine.state={source:'device',coherence:.76,attention:null,relaxation:null,HR:null,feedbackMix:0,relaxationControl:.5,attentionControl:.5};
   if(engine.meta)engine.targetY=engine.elevation(engine.view.x,engine.view.z)+35;engine.transition=0;engine.viewDrift=0;
   const settings=JSON.stringify(engine.visual);const geometry=engine.geographic?[...engine.layers.values()].flatMap(l=>l.items).map(i=>i.body.geometry.attributes.position.array):[engine.points.geometry.attributes.position.array];const saved=geometry.map(a=>a.slice(0,300));
   for(let i=0;i<10;i++)tick();const camera=engine.camera.position.toArray();
   const run=mix=>{engine.state.feedbackMix=mix;engine.state.relaxationControl=.9;engine.state.attentionControl=.9;for(let i=0;i<5;i++)tick();const begin=performance.now();for(let i=0;i<30;i++)tick();return (performance.now()-begin)/30;};
   const off1=run(0),on1=run(1),on2=run(1),off2=run(0);check(engine.camera.position.toArray().every((x,i)=>Math.abs(x-camera[i])<1e-6),'EEG moved camera');
   check(geometry.every((a,i)=>saved[i].every((x,j)=>x===a[j])),'EEG changed source geometry');check(JSON.stringify(engine.visual)===settings,'EEG overwrote manual settings');
   engine.state.feedbackMix=1;tick();if(engine.geographic){check(engine.uniforms.geoLocked.value===1,'terrain must be locked in device mode');check(engine.uniforms.accentGain.value>1,'accent mapping absent');}else check(engine.uniforms.uPulse.value===0,'missing HR must not pulse');
   const pose=engine.geographic?engine.view.distance:engine.orbit.zoom;
   for(let i=0;i<60;i++){now=performance.now();engine.previous=now-1000/60;engine.applyGesture({mode:'zoom',zoomRate:.5},now);engine.render(now);gl.finish();}check((engine.geographic?engine.view.distance:engine.orbit.zoom)<pose,'gesture zoom must remain independent');
   engine.setVisual({...DEFAULT_VISUAL,mode:'original'});tick();check(engine.geographic?engine.uniforms.original.value===1:engine.uniforms.uOriginal.value===1,'raw comparison');
   check(gl.getError()===0,'WebGL error');const output={offMs:(off1+off2)/2,onMs:(on1+on2)/2,sourceUnchanged:true,cameraIndependent:true,gestureZoom:true,noHR:true};engine.dispose();return output;
  });results.push({world,...result,overheadPercent:(result.onMs/result.offMs-1)*100});console.log('PASS EEG render',world,JSON.stringify(result));
 }
 assert.deepEqual(errors,[]);await writeFile('artifacts/eeg/render.json',JSON.stringify({results,errors,environment:'headless Chromium, diagnostic only; not physical GPU acceptance'},null,2));
}finally{await browser.close();}
