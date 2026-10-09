import { readFile, writeFile } from 'node:fs/promises';
import { latLngToXYZ } from '../src/core/locations.mjs';
const dir = new URL('../public/globe/', import.meta.url);
const geo = JSON.parse(await readFile(new URL('land.geojson', dir)));
const polygons = geo.features.flatMap(f => f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates).map(rings => ({
  rings, bbox: rings[0].reduce((b, [x, y]) => [Math.min(b[0], x), Math.min(b[1], y), Math.max(b[2], x), Math.max(b[3], y)], [180, 90, -180, -90]),
}));
function inside(x, y, ring) {
  let hit = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j];
    if ((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) hit = !hit;
  }
  return hit;
}
const positions = [];
for (let lat = -85; lat < 85; lat += 0.64) {
  const step = 0.64 / Math.max(0.18, Math.cos(lat * Math.PI / 180));
  for (let lng = -180; lng < 180; lng += step) {
    if (polygons.some(({ rings, bbox: b }) => lng >= b[0] && lng <= b[2] && lat >= b[1] && lat <= b[3] && inside(lng, lat, rings[0]) && !rings.slice(1).some(h => inside(lng, lat, h)))) positions.push(...latLngToXYZ(lat, lng));
  }
}
// A distributed order keeps all continents present at reduced draw density.
let seed = 315;
for (let i = positions.length / 3 - 1; i > 0; i--) {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  const j = seed % (i + 1);
  for (let k = 0; k < 3; k++) [positions[i * 3 + k], positions[j * 3 + k]] = [positions[j * 3 + k], positions[i * 3 + k]];
}
const points = new Float32Array(positions);
await writeFile(new URL('land-points.bin', dir), Buffer.from(points.buffer));
await writeFile(new URL('manifest.json', dir), JSON.stringify({ count: points.length / 3, bytes: points.byteLength, format: 'float32 xyz unit sphere', source: 'Natural Earth ne_110m_land', license: 'Public Domain' }, null, 2));
console.log(`Globe: ${points.length / 3} land points, ${points.byteLength} bytes`);
