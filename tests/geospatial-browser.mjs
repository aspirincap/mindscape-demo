import {chromium} from 'playwright';
import {existsSync,readdirSync} from 'node:fs';
import {mkdir,writeFile} from 'node:fs/promises';
import {homedir} from 'node:os';import {join} from 'node:path';import assert from 'node:assert/strict';
const cache=join(homedir(),'Library/Caches/ms-playwright');const fallback=existsSync(cache)?readdirSync(cache).filter(n=>/^chromium_headless_shell-\d+$/.test(n)).sort().reverse().map(n=>join(cache,n,`chrome-headless-shell-mac-${process.arch==='arm64'?'arm64':'x64'}`,'chrome-headless-shell')).find(existsSync):undefined;
const browser=await chromium.launch({headless:true,executablePath:existsSync(chromium.executablePath())?undefined:fallback});
const base=process.env.GEO_TEST_URL||'http://127.0.0.1:5174';const worlds=(process.env.GEO_TEST_WORLDS||'fuji,grand-canyon').split(',');const errors=[],report=[];await mkdir('artifacts/geospatial/verification',{recursive:true});
try{
 const page=await browser.newPage({viewport:{width:1440,height:960}});page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 for(const world of worlds){
  await page.goto(`${base}/tests/geospatial-lab.html?world=${world}`);await page.waitForFunction(()=>window.engine?.ready&&window.stats?.points>10000,null,{timeout:60000});await page.waitForTimeout(4500);
  const overview=await page.evaluate(()=>({stats,meta:{points:engine.meta.pointCount,width:engine.meta.width,depth:engine.meta.depth},gl:engine.renderer.getContext().getError()}));assert.equal(overview.gl,0);assert.ok(overview.meta.width>20000);await page.screenshot({path:`artifacts/geospatial/verification/${world}-overview.png`});
  await page.evaluate(()=>engine.focusPoi(engine.meta.pois[0].id));await page.waitForTimeout(4000);await page.screenshot({path:`artifacts/geospatial/verification/${world}-detail.png`});
  const before=await page.evaluate(()=>({...engine.view}));await page.mouse.move(850,400);await page.mouse.down();await page.mouse.move(1000,500,{steps:12});await page.mouse.up();const after=await page.evaluate(()=>({...engine.view}));assert.notEqual(before.x,after.x);
  await page.evaluate(async()=>{const start=performance.now();while(performance.now()-start<1500){engine.applyGesture({mode:'zoom',zoomRate:1});await new Promise(r=>setTimeout(r,30));}});const near=await page.evaluate(()=>engine.view.distance);assert.ok(near<after.distance*.65,`zoom ratio ${near/after.distance}`);await page.waitForTimeout(400);const stopped=await page.evaluate(()=>engine.view.distance);await page.waitForTimeout(400);assert.equal(await page.evaluate(()=>engine.view.distance),stopped);
  await page.evaluate(()=>engine.resetCamera());await page.waitForTimeout(1000);report.push({world,overview,detail:await page.evaluate(()=>stats),panDistance:Math.hypot(after.x-before.x,after.z-before.z),zoomRatio:near/after.distance});
 }
 await page.goto(base);await page.getByRole('link',{name:'直接探索 12 个世界',exact:true}).click();await page.getByRole('button',{name:'选择目的地：富士山',exact:true}).click();await page.getByRole('button',{name:'进入富士山',exact:true}).click();await page.getByRole('region',{name:'空中导览',exact:true}).waitFor({timeout:60000});await page.getByText('地图与导览设置',{exact:true}).click();await page.waitForTimeout(3500);await page.screenshot({path:'artifacts/geospatial/verification/fuji-ui.png'});
 await page.getByRole('button',{name:'打开探索地图与数据来源',exact:true}).click();await page.getByRole('dialog',{name:'富士山探索地图与来源'}).waitFor();await page.screenshot({path:'artifacts/geospatial/verification/map-ui.png'});await page.getByRole('button',{name:'关闭探索地图',exact:true}).click();
 assert.deepEqual(errors,[]);await writeFile('artifacts/geospatial/verification/browser.json',JSON.stringify({report,errors},null,2));console.log(JSON.stringify({report,errors},null,2));
}catch(error){console.error('Browser errors:',errors);throw error;}finally{await browser.close();}
