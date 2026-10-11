import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { SCENE_ASSETS } from '../src/core/scene-assets.mjs';

for (const asset of SCENE_ASSETS) {
  const file = new URL(`../artifacts/scene-clouds-published/${asset.key}`,import.meta.url);
  const bytes = await readFile(file);
  if (createHash('sha256').update(bytes).digest('hex') !== asset.sha256) throw new Error(`Invalid source: ${asset.id}`);
  console.log(`Uploading ${asset.id} (${Math.round(asset.bytes/1024/1024)} MiB)`);
  await new Promise((resolve,reject) => {
    const child=spawn(process.execPath,['node_modules/wrangler/bin/wrangler.js','r2','object','put',`mindscape-terrain/${asset.key}`,'--file',file.pathname,'--remote','--content-type','application/octet-stream'],{cwd:new URL('..',import.meta.url),stdio:['ignore','pipe','pipe']});
    let output=''; child.stdout.on('data',b=>output+=b); child.stderr.on('data',b=>output+=b);
    child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(new Error(output)));
  });
  console.log(`Published ${asset.id}: ${asset.sha256.slice(0,16)}`);
}
