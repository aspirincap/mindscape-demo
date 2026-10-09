// Historical V.04.1 archive validator: checks saved commands, not the current
// held-pinch controller. Current continuous zoom is tested by rate-zoom.html.
// No video or participant landmarks are checked into the project or uploaded.
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

assert.ok(process.argv.length > 2, 'Pass one or more local recording JSON files');
for (const file of process.argv.slice(2)) {
  const report = JSON.parse(readFileSync(file, 'utf8'));
  assert.ok(report.rows.every(row => Number.isFinite(row.current?.zoom)), 'Requires an archived V.04.1 delta-zoom recording');
  const rows = report.rows.map(row => ({ ...row, command: row.current }));
  const window = (from, to) => rows.filter(row => row.time >= from && row.time <= to);
  // Stable phases visually reviewed in the supplied 14.6 s clip. Transition
  // frames are deliberately excluded; these are not a general accuracy score.
  const movement = [[1,1.7],[2,2.6],[3.4,5.7],[12.6,13.1],[13.7,14.55]];
  for (const [from, to] of movement) {
    const group = window(from,to); assert.ok(group.length);
    assert.ok(group.every(row => row.command.mode === 'rotate'), `Movement mode dropped at ${from}–${to}s: ${file}`);
    assert.ok(group.every(row => row.command.zoom === 0), `Movement accidentally zoomed: ${file}`);
  }
  const zoom = window(6.2,12.05);
  assert.ok(zoom.length && zoom.every(row => row.command.mode === 'zoom'), `Zoom mode dropped: ${file}`);
  assert.ok(zoom.every(row => row.command.dx === 0 && row.command.dy === 0), `Pinch accidentally panned: ${file}`);
  for (const [from,to,direction] of [[6.65,7.1,-1],[7.3,7.65,1],[7.75,8.15,-1],[8.35,8.75,1]]) {
    assert.ok(window(from,to).reduce((sum,row) => sum+row.command.zoom,0)*direction > 0, `Wrong zoom direction at ${from}–${to}s: ${file}`);
  }
  const firstZoom = rows.find(row => row.time > 5 && row.command.mode === 'zoom')?.time;
  assert.ok(firstZoom <= 6.2, `Initial opening missed: ${file}`);
  assert.ok(rows.every(row => [row.command.dx,row.command.dy,row.command.zoom].every(Number.isFinite)));
  console.log(JSON.stringify({ file, sampleHz:report.input.sampleHz, frames:rows.length, firstZoom, stableMovementFrames:movement.reduce((n,[a,b])=>n+window(a,b).length,0), stableZoomFrames:zoom.length, checks:'PASS' }));
}
