import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { WebSocket } from 'ws';

// Tests the production build on a separate loopback port, then cleans it up.
const port = 5178;
const child = spawn(process.execPath, ['server/index.mjs'], { env: { ...process.env, NODE_ENV: 'production', PORT: String(port) }, stdio: ['ignore', 'pipe', 'pipe'] });
let startup = '';
child.stdout.on('data', d => { startup += d; });
child.stderr.on('data', d => process.stderr.write(d));
let socket;
try {
  for (let i = 0; i < 100 && !startup.includes('ready'); i++) {
    if (child.exitCode !== null) throw new Error('Production server failed to start');
    await new Promise(r => setTimeout(r, 100));
  }
  assert.ok(startup.includes('ready'));
  const base = `http://127.0.0.1:${port}`;
  const html = await (await fetch(base)).text();
  assert.ok(html.includes('Mindscape'));
  const script = html.match(/src="([^"]+\.js)"/)[1];
  assert.equal((await fetch(base + script)).status, 200);
  assert.equal((await fetch(base + '/worlds/forest.bin')).status, 200);
  assert.equal((await fetch(base + '/globe/land-points.bin')).status, 200);
  assert.equal((await fetch(base + '/worlds/missing.bin')).status, 404);
  const health = await (await fetch(base + '/api/health')).json();
  assert.deepEqual(health.worlds, ['abyss', 'forest']);
  const locations = await (await fetch(base + '/api/locations')).json();
  assert.equal(locations.locations.length, 2);
  const route = await (await fetch(base + '/api/route', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: '想去森林' }) })).json();
  assert.equal(route.recommendedWorlds.length, 2);
  assert.equal(route.recommendedWorlds[0].locationId, 'yakushima-forest');
  assert.equal((await fetch(base + '/api/frame', { method: 'POST', headers: { Origin: 'https://unrelated.example', 'Content-Type': 'application/json' }, body: '{}' })).status, 403);
  socket = new WebSocket(`ws://127.0.0.1:${port}/ws`);
  await once(socket, 'open');
  const received = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('No sensor broadcast')), 3000);
    socket.on('message', raw => { const data = JSON.parse(raw); if (data.type === 'frame') { clearTimeout(timeout); resolve(data); } });
  });
  socket.send(JSON.stringify({ type: 'sensor', frame: { attention: 0.7, relaxation: 0.8, HR: 65, signalQuality: 1 } }));
  const data = await received;
  assert.equal(data.frame.relaxation, 0.8); assert.equal(data.stale, false);
  console.log('PASS production static assets, both worlds, HTTP health, same-origin guard and WebSocket sensor input');
} finally {
  socket?.close(); child.kill('SIGTERM');
  await once(child, 'exit');
}
