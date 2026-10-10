import {chromium} from 'playwright';
import {existsSync,readdirSync} from 'node:fs';
import {mkdir,writeFile} from 'node:fs/promises';
import {homedir} from 'node:os';import {join} from 'node:path';import assert from 'node:assert/strict';
const cache=join(homedir(),'Library/Caches/ms-playwright');const fallback=existsSync(cache)?readdirSync(cache).filter(n=>/^chromium_headless_shell-\d+$/.test(n)).sort().reverse().map(n=>join(cache,n,`chrome-headless-shell-mac-${process.arch==='arm64'?'arm64':'x64'}`,'chrome-headless-shell')).find(existsSync):undefined;
const browser=await chromium.launch({headless:true,executablePath:existsSync(chromium.executablePath())?undefined:fallback});
const base=process.env.GEO_TEST_URL||'http://127.0.0.1:5174',worlds=(process.env.GEO_TEST_WORLDS||'fuji,grand-canyon').split(','),errors=[],report=[];
const dir='artifacts/geospatial/visual';await mkdir(dir,{recursive:true});
try{
 const page=await browser.newPage({viewport:{width:1200,height:820}});page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 for(const world of worlds){
  await page.goto(`${base}/tests/geospatial-lab.html?world=${world}`);await page.waitForFunction(()=>window.engine?.ready&&window.stats?.points>10000,null,{timeout:60000});
  await page.evaluate(()=>{engine.view.distance*=.73;});await page.waitForTimeout(5500);
  await page.evaluate(async()=>{
   window.styles=await import('/src/core/visual-style.mjs');engine.renderer.setAnimationLoop(null);engine.tiles.update=()=>{};engine.lastStats=Number.MAX_SAFE_INTEGER;engine.active=true;engine.state.coherence=1;engine.targetY=engine.elevation(engine.view.x,engine.view.z)+35;
   document.querySelector('#stats').style.display='none';window.now=performance.now();window.tick=(n=1)=>{for(let i=0;i<n;i++){now+=1000/30;engine.render(now);}};
   window.measure=()=>{const gl=engine.renderer.getContext(),p=new Uint8Array(gl.drawingBufferWidth*gl.drawingBufferHeight*4);gl.readPixels(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight,gl.RGBA,gl.UNSIGNED_BYTE,p);let lit=0,energy=0,difference=0;for(let i=0;i<p.length;i+=4){const l=p[i]+p[i+1]+p[i+2];if(l>40)lit++;energy+=l;if(window.previousPixels)difference+=Math.abs(p[i]-previousPixels[i])+Math.abs(p[i+1]-previousPixels[i+1])+Math.abs(p[i+2]-previousPixels[i+2]);}window.previousPixels=p;return {lit,energy,difference,gl:gl.getError(),trail:engine.effects.trail.enabled,history:engine.effects.trail.valid,bloom:engine.effects.bloom.enabled};};
  });
  const modes=[];
  for(const mode of ['original','particles','cinematic']){
   const result=await page.evaluate(mode=>{engine.setVisual({...styles.DEFAULT_VISUAL,mode});tick(3);return measure();},mode);assert.equal(result.gl,0);assert.ok(result.lit>3000);if(mode!=='original')assert.ok(result.difference>100000);if(mode==='particles')assert.ok(!result.trail&&!result.bloom);if(mode==='cinematic')assert.ok(result.trail&&result.history&&result.bloom);modes.push({mode,...result});await page.screenshot({path:`${dir}/${world}-${mode}.png`});
  }
  for(const preset of ['lucid','luminous','dream']){await page.evaluate(preset=>{engine.setVisual({...styles.VISUAL_PRESETS[preset],mode:'cinematic'});tick(150);},preset);await page.screenshot({path:`${dir}/${world}-${preset}.png`});}
  const checks=await page.evaluate(()=>{
   const checks=[];const check=(ok,label)=>{if(!ok)throw new Error(label);checks.push(label);};
   const geometries=[...engine.layers.values()].flatMap(l=>l.items).map(i=>[i.body.geometry.attributes.position.array,i.body.geometry.attributes.position.array.slice(0,60)]);
   engine.setVisual({...styles.DEFAULT_VISUAL,mode:'particles',dispersion:0});engine.dispersion=0;tick();measure();tick(35);const flow=measure();check(flow.difference>100000,'flow remains visible at zero dispersion');
   engine.setVisual({...styles.DEFAULT_VISUAL,mode:'particles',speed:0,flow:0,pointSize:.5});tick(180);const small=measure();engine.setVisual({...styles.DEFAULT_VISUAL,mode:'particles',speed:0,flow:0,pointSize:2});tick(180);const large=measure();check(large.energy>small.energy*1.2,'point-size slider visibly changes even clamped sprites');
   engine.setVisual({...styles.DEFAULT_VISUAL,mode:'particles',speed:0,flow:0,brightness:.5});tick(180);const dark=measure();engine.setVisual({...styles.DEFAULT_VISUAL,mode:'particles',speed:0,flow:0,brightness:2});tick(180);check(measure().energy>dark.energy*1.2,'brightness slider changes linear-light output');
   const active=[...engine.layers.values()].filter(l=>l.visible);const accents=active.flatMap(l=>l.items).reduce((n,i)=>n+i.geometry.attributes.position.count,0),body=active.flatMap(l=>l.items).reduce((n,i)=>n+i.body.geometry.attributes.position.count,0);check(accents>0&&accents<body*.015,'sparse accents stay below 1.5% of body points');
   engine.setVisual(styles.DEFAULT_VISUAL);tick(4);check(engine.effects.trail.valid,'stationary view accumulates accent history');const ratio=engine.uniforms.uPixelRatio.value;check(ratio===engine.effectPixelRatio,'shared pixel ratio restored after trail pass');
   engine.move(30,20,'pan');tick();check(!engine.effects.trail.enabled&&!engine.effects.trail.valid,'pan clears history');tick(4);engine.move(30,20,'orbit');tick();check(!engine.effects.trail.enabled,'orbit clears history');tick(4);
   engine.active=false;tick();const frozen=engine.clock;tick(4);check(engine.clock===frozen&&!engine.effects.trail.enabled,'pause freezes particles and disables trail');engine.active=true;
   engine.reduced=true;tick();check(!engine.effects.trail.enabled,'reduced motion disables trail');engine.reduced=false;
   engine.setVisual({...styles.DEFAULT_VISUAL,dispersion:1});tick(240);check(engine.dispersion>.9,'dispersion slider expands the cloud');engine.setVisual({...styles.DEFAULT_VISUAL,dispersion:0});tick(300);check(engine.dispersion<.001,'dispersion returns to stable shape');
   check(geometries.every(([array,saved])=>saved.every((v,i)=>v===array[i])),'source survey coordinates remain unchanged');
   engine.setVisual({...styles.DEFAULT_VISUAL,mode:'original'});tick();measure();tick(20);check(measure().difference===0,'original mode remains a static source comparison');
   const tile=[...engine.layers.keys()][0],layer=engine.layers.get(tile);engine.disposeTileLayers(tile);check(layer.items.every(i=>!i.accent.parent&&!i.trail.parent),'tile disposal removes both accent layers');
   engine.dispose();check(engine.layers.size===0&&engine.accentScene.children.length===0,'scene disposal releases all accent layers');check(!document.querySelector('#scene canvas'),'canvas released');return {checks,accents,body,flowDifference:flow.difference};
  });
  report.push({world,modes,...checks});console.log('PASS',world,checks.checks.length,'visual checks');
 }
 assert.deepEqual(errors,[]);await writeFile(`${dir}/results.json`,JSON.stringify({report,errors},null,2));
}catch(e){console.error(errors);throw e;}finally{await browser.close();}
