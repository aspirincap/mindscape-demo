import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { SCENE_ASSETS, sceneAssetForPath } from '../src/core/scene-assets.mjs';
import { LOCATIONS } from '../src/core/locations.mjs';
import { buildSceneTour, scenePlayback, sceneLimits, clampSceneOrbit, sceneTourVisual } from '../src/core/scene-tour.mjs';
import { sceneResponse } from '../worker/scenes.mjs';

test('catalogue contains only two geographic worlds and all twenty distinct supplied scenes', () => {
  assert.deepEqual(LOCATIONS.filter(l=>!l.inspired).map(l=>l.worldId),['fuji','grand-canyon']);
  assert.deepEqual(LOCATIONS.filter(l=>l.inspired).map(l=>l.worldId),SCENE_ASSETS.map(a=>a.id));
  assert.equal(new Set(SCENE_ASSETS.map(a=>a.sha256)).size,20);
  for(const a of SCENE_ASSETS){assert.equal(a.bytes,a.count*32);assert.ok(a.safeYaw>=2&&a.safeYaw<=6);}
});

test('all short tours stay inside observed-view limits, loop continuously and move gently', () => {
  for(const asset of SCENE_ASSETS){
    const route=buildSceneTour(asset.id),limits=sceneLimits(asset);
    assert.ok(route.duration>=48&&route.duration<=72);
    assert.deepEqual(route.pose(0),route.pose(route.duration));
    let previous=route.pose(0),movement=0;
    for(let s=1;s<=route.duration*60;s++){
      const pose=route.pose(s/60);
      assert.equal(pose.x,Math.max(limits.minX,Math.min(limits.maxX,pose.x)));
      assert.ok(Math.abs(pose.y)<=.65&&pose.zoom>=-3.5&&pose.zoom<=.6);
      const step=Math.hypot(pose.x-previous.x,pose.y-previous.y,pose.zoom-previous.zoom);
      assert.ok(step<.02);movement+=step;previous=pose;
    }
    assert.ok(movement>2);
    assert.deepEqual(clampSceneOrbit(asset,{x:99,y:99,zoom:99}),{x:limits.maxX,y:.65,zoom:.6});
    assert.deepEqual(clampSceneOrbit(asset,{x:-99,y:-99,zoom:-99}),{x:limits.minX,y:-.65,zoom:-3.5});
  }
});

test('short-tour pause, manual takeover, reduced motion and hidden gaps do not advance time', () => {
  const tour=scenePlayback('scene-05',true);
  assert.equal(tour.status,'paused');tour.advance(.1);assert.equal(tour.time,0);
  tour.resume();tour.advance(.1);assert.equal(tour.time,.1);
  for(const [dt,active,hidden] of [[2,true,false],[.1,false,false],[.1,true,true]])tour.advance(dt,active,hidden);
  assert.equal(tour.time,.1);tour.manual();tour.advance(.1);assert.equal(tour.time,.1);
  tour.autoVisual=false;tour.resume();assert.equal(tour.autoVisual,false);tour.restart();assert.equal(tour.autoVisual,true);assert.equal(tour.time,0);
});

test('particle and colour choreography is continuous and begins/ends clear', () => {
  const start=sceneTourVisual(0),end=sceneTourVisual(1);
  assert.equal(start.paletteMix,0);assert.equal(start.dispersion,0);assert.equal(end.paletteMix,0);assert.ok(end.dispersion<1e-8);
  let previous=start,maxPalette=0,maxDispersion=0;
  for(let i=1;i<=2000;i++){
    const visual=sceneTourVisual(i/2000);
    for(const key of ['paletteMix','brightness','flow','dispersion','saturation']){assert.ok(Number.isFinite(visual[key]));assert.ok(Math.abs(visual[key]-previous[key])<.025);}
    maxPalette=Math.max(maxPalette,visual.paletteMix);maxDispersion=Math.max(maxDispersion,visual.dispersion);previous=visual;
  }
  assert.ok(maxPalette>1.9);assert.ok(maxDispersion>.07&&maxDispersion<=.075);
});

test('R2 scene route allowlists exact content versions and rejects arbitrary keys or truncated assets', async () => {
  const asset=SCENE_ASSETS[0],request=(path,method='GET')=>new Request('https://demo.test'+path,{method});
  for(const path of ['/scene-data/scene-99/missing.bin','/scene-data/scene-01/../secret','/scene-data/scene-01/0000000000000000.bin'])assert.equal(sceneAssetForPath(path),undefined);
  assert.equal((await sceneResponse(request(asset.url,'POST'),null)).status,405);
  assert.equal((await sceneResponse(request('/scene-data/no'),null)).status,404);
  assert.equal((await sceneResponse(request(asset.url),null)).status,503);
  let key;
  const bucket={head:async k=>{key=k;return {size:asset.bytes};},get:async k=>{key=k;return {size:asset.bytes,body:new Uint8Array([1,2,3])};}};
  const head=await sceneResponse(request(asset.url,'HEAD'),bucket);assert.equal(key,asset.key);assert.equal(head.headers.get('Content-Length'),String(asset.bytes));assert.equal((await head.arrayBuffer()).byteLength,0);
  const response=await sceneResponse(request(asset.url),bucket);assert.equal(response.status,200);assert.ok(response.headers.get('Cache-Control').includes('immutable'));assert.deepEqual(new Uint8Array(await response.arrayBuffer()),new Uint8Array([1,2,3]));
  assert.equal((await sceneResponse(request(asset.url),{get:async()=>({size:7})})).status,502);
});

test('all imported payloads are byte-identical, finite and correctly counted', async t => {
  if(!existsSync(new URL(`../artifacts/scene-clouds-published/${SCENE_ASSETS[0].key}`,import.meta.url))){t.skip('Run npm run assets with the supplied archive for payload validation');return;}
  for(const asset of SCENE_ASSETS){
    const raw=await readFile(new URL(`../artifacts/scene-clouds-published/${asset.key}`,import.meta.url));
    assert.equal(raw.length,asset.bytes);assert.equal(createHash('sha256').update(raw).digest('hex'),asset.sha256);
    const points=new Float32Array(raw.buffer,raw.byteOffset,raw.byteLength/4);assert.ok(points.every(Number.isFinite));
  }
});
