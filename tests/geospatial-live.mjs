import assert from 'node:assert/strict';
import { readFile, open, writeFile, mkdir } from 'node:fs/promises';
if(process.env.TEST_HTTPS_PROXY){const {ProxyAgent,setGlobalDispatcher}=await import('undici');setGlobalDispatcher(new ProxyAgent(process.env.TEST_HTTPS_PROXY));}
const base=process.env.DEPLOY_URL||'https://mindscape-demo.aspirincap.workers.dev';
const report=[];
for(const world of ['fuji','grand-canyon']){
 const response=await fetch(`${base}/terrain/${world}/manifest.json`);assert.equal(response.status,200);assert.match(response.headers.get('cache-control'),/no-cache/);
 const meta=await response.json(),local=JSON.parse(await readFile(`public/terrain/${world}/manifest.json`));assert.equal(meta.version,local.version);
 const tiles=await (await fetch(base+meta.tileset)).json(),nodes=[];const walk=n=>{if(n.content)nodes.push(n);for(const child of n.children||[])walk(child);};walk(tiles.root);
 const pack=await open(`artifacts/geospatial/published/${world}/${meta.version}.pack`);
 try{for(const node of [nodes[0],nodes[Math.floor(nodes.length/2)],nodes.at(-1)]){
  const uri=node.content.uri,parts=uri.match(/\/(\d+)-(\d+)\.pnts$/),offset=Number(parts[1]),length=Number(parts[2]);
  const r=await fetch(base+uri);assert.equal(r.status,200);assert.match(r.headers.get('cache-control'),/immutable/);const actual=Buffer.from(await r.arrayBuffer()),expected=Buffer.alloc(length);await pack.read(expected,0,length,offset);assert.deepEqual(actual,expected);assert.equal(actual.toString('ascii',0,4),'pnts');
  const head=await fetch(base+uri,{method:'HEAD'});assert.equal(head.status,200);assert.equal(Number(head.headers.get('content-length')),length);
 }}finally{await pack.close();}
 assert.equal((await fetch(`${base}/terrain-data/${world}/${meta.version}/999999999-100.pnts`)).status,416);
 const height=await fetch(base+meta.heightGrid.url);assert.equal((await height.arrayBuffer()).byteLength,meta.heightGrid.size**2*4);
 report.push({world,version:meta.version,points:meta.pointCount,tiles:nodes.length,checks:'first / middle / final PNTS byte equality, HEAD, invalid range, height grid, cache'});
}
assert.equal((await fetch(`${base}/terrain-data/unknown/000000000000/0-100.pnts`)).status,404);
await mkdir('artifacts/geospatial/verification',{recursive:true});await writeFile('artifacts/geospatial/verification/live.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
