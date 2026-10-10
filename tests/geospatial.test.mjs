import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, open } from 'node:fs/promises';
import { sampleElevation, panView, zoomView, gestureZoom } from '../src/core/geo-navigation.mjs';
import { parseTerrainTile } from '../src/core/terrain-format.mjs';
import { terrainResponse } from '../worker/terrain.mjs';
const meta={width:1000,depth:1000,heightGrid:{size:2}};
test('navigation interpolates metre elevation and clamps out-of-bounds terrain samples',()=>{
 const heights=new Float32Array([100,200,300,400]);assert.equal(sampleElevation(meta,heights,0,0),250);assert.equal(sampleElevation(meta,heights,-500,-500),100);assert.equal(sampleElevation(meta,heights,9000,9000),400);
});
test('one-hand rate zoom is continuous and stops on stale or suspended input',()=>{
 const view={x:0,z:0,yaw:0,distance:1000};for(let i=0;i<60;i++)gestureZoom(view,{mode:'zoom',zoomRate:1,time:i*1000/60},i*1000/60,1/60,meta);
 assert.ok(view.distance<550&&view.distance>500);const distance=view.distance;gestureZoom(view,{mode:'zoom',zoomRate:1,time:0},5000,.016,meta);assert.equal(view.distance,distance);gestureZoom(view,{mode:'zoom',zoomRate:1,time:5000},5000,2,meta);assert.equal(view.distance,distance);
 for(let i=0;i<100;i++)zoomView(view,-1,meta);assert.equal(view.distance,120);for(let i=0;i<100;i++)zoomView(view,1,meta);assert.equal(view.distance,2000);
 panView(view,5000,-5000,meta);assert.equal(view.x,490);assert.equal(view.z,-490);
});
test('terrain routes reject traversal, unknown worlds and unsafe byte ranges',()=>{
 assert.deepEqual(parseTerrainTile('/terrain-data/fuji/0123456789ab/120-240.pnts'),{world:'fuji',revision:'0123456789ab',offset:120,length:240,key:'fuji/0123456789ab.pack'});
 for(const path of ['/terrain-data/../0123456789ab/0-200.pnts','/terrain-data/forest/0123456789ab/0-200.pnts','/terrain-data/fuji/0123456789ab/0-999999999.pnts','/terrain-data/fuji/0123456789ab/999999999999999999999-28.pnts'])assert.equal(parseTerrainTile(path),null);
});
test('R2 segment responses have exact bytes and do not expose arbitrary object keys',async()=>{
 const bytes=new Uint8Array(128).map((_,i)=>i),calls=[];const bucket={get:async(key,{range})=>{calls.push(key);return {size:128,body:new Response(bytes.slice(range.offset,range.offset+range.length)).body};}};
 const url='https://demo.test/terrain-data/fuji/0123456789ab/32-40.pnts';let r=await terrainResponse(new Request(url),bucket);assert.equal(r.status,200);assert.deepEqual(new Uint8Array(await r.arrayBuffer()),bytes.slice(32,72));assert.match(r.headers.get('cache-control'),/immutable/);
 r=await terrainResponse(new Request(url,{method:'HEAD'}),bucket);assert.equal(r.headers.get('content-length'),'40');assert.equal((await r.arrayBuffer()).byteLength,0);
 assert.equal((await terrainResponse(new Request(url.replace('32-40','120-40')),bucket)).status,416);
 assert.equal((await terrainResponse(new Request(url,{method:'POST'}),bucket)).status,405);
 assert.ok(calls.every(k=>k==='fuji/0123456789ab.pack'));
 assert.equal((await terrainResponse(new Request(url),{get:async()=>{throw new Error('The requested range is not satisfiable (416)');}})).status,416);
});
test('published geographic manifests reference valid immutable PNTS segments',async()=>{
 for(const place of ['fuji','grand-canyon']){
  const manifest=JSON.parse(await readFile(`public/terrain/${place}/manifest.json`));
  const root=JSON.parse(await readFile(`public/terrain/${place}/tileset.json`)).root;
  const bytes=await readFile(`public/terrain/${place}/height.f32`);const height=new Float32Array(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));
  assert.ok(manifest.pointCount>4000000);assert.ok(manifest.width>20000&&manifest.depth>20000);assert.equal(height.length,manifest.heightGrid.size**2);
  let pack;try{pack=await open(`artifacts/geospatial/published/${place}/${manifest.version}.pack`);}catch(e){if(e.code==='ENOENT')continue;throw e;}
  try{let leafPoints=0;const walk=async node=>{assert.ok(node.boundingVolume.box.every(Number.isFinite));if(node.content){const part=parseTerrainTile(node.content.uri);assert.ok(part);const header=Buffer.alloc(28);await pack.read(header,0,28,part.offset);assert.equal(header.toString('ascii',0,4),'pnts');assert.equal(header.readUInt32LE(8),part.length);assert.equal((28+header.readUInt32LE(12))%8,0);if(!node.children?.length){const feature=Buffer.alloc(header.readUInt32LE(12));await pack.read(feature,0,feature.length,part.offset+28);leafPoints+=JSON.parse(feature.toString()).POINTS_LENGTH;}}for(const child of node.children||[])await walk(child);};await walk(root);assert.equal(leafPoints,manifest.pointCount);}finally{await pack.close();}
 }
});
