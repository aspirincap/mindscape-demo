// Validate the local JSON exported by tests/rate-zoom.html. No private media
// or landmarks are needed here; the test page uses the production component.
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
assert.ok(process.argv[2], 'Pass a local rate-zoom report JSON file');
const { samples } = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const phase = name => {
  const rows = samples.filter(row => row.phase === name);
  assert.ok(rows.length, `Missing phase: ${name}`);
  assert.ok(rows.every(row => [row.time, row.zoom, row.rate].every(Number.isFinite)), `Non-finite input: ${name}`);
  return rows;
};
const summary = [];
for (const [name, direction] of [['zoom-in-10s', -1], ['zoom-out-10s', 1]]) {
  const rows = phase(name), duration = rows.at(-1).time - rows[0].time;
  assert.ok(duration >= 9.8, `Incomplete hold: ${name}`);
  assert.ok(rows.every(row => row.mode === 'zoom'), `Zoom dropped: ${name}`);
  assert.ok(rows.every((row, i) => !i || (row.zoom - rows[i - 1].zoom) * direction >= -1e-6), `Reversed direction: ${name}`);
  const change = rows.at(-1).zoom - rows[0].zoom;
  assert.ok(change * direction > 3, `Insufficient travel: ${name}`);
  summary.push({ phase: name, duration, samples: rows.length, zoomChange: change });
}
for (const name of ['center-stop', 'release', 're-pinch-new-origin', 'tracking-loss', 'paused', 'resume-neutral', 'frozen-video', 'recover-fresh-anchor']) {
  const all = phase(name), rows = all.filter(row => row.time >= all[0].time + .35);
  assert.ok(rows.length >= 3, `Incomplete stop: ${name}`);
  const spread = Math.max(...rows.map(row => row.zoom)) - Math.min(...rows.map(row => row.zoom));
  assert.ok(spread < .015, `Zoom continued after stop: ${name}`);
  assert.ok(rows.every(row => row.rate === 0), `Rate retained after stop: ${name}`);
  summary.push({ phase: name, stableZoomSpread: spread, samples: rows.length });
}
for (const name of ['before-pause', 'before-freeze']) {
  const rows = phase(name);
  assert.ok(rows[0].zoom - rows.at(-1).zoom > .3, `Safety test never started zooming: ${name}`);
}
console.log(JSON.stringify({ checks: 'PASS', fixture: 'Real local hand images with synthesized vertical motion; not a live-user trial', summary }, null, 2));
