import { mkdir, writeFile } from 'node:fs/promises';

// Original deterministic point-cloud assets. No remote services or licensed scans.
const out = new URL('../public/worlds/', import.meta.url);
await mkdir(out, { recursive: true });
function rng(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t ^= t + Math.imul(t ^ t >>> 7, 61 | t); return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

function generate(id) {
  const rand = rng(id === 'abyss' ? 493 : 183);
  const points = [];
  const R = (a, b) => a + rand() * (b - a);
  const TAU = Math.PI * 2;
  const stone = [0.38, 0.68, 0.65], light = [0.79, 0.87, 0.69];
  const leaf = [0.37, 0.58, 0.37], wood = [0.47, 0.38, 0.24];
  const add = (x, y, z, color, size = 1, motion = 0) => {
    const shade = R(0.63, 1.18);
    points.push(x, y, z, Math.min(1, color[0] * shade), Math.min(1, color[1] * shade), Math.min(1, color[2] * shade), size * R(0.72, 1.3), motion);
  };
  function box(cx, cy, cz, w, h, d, n, col) {
    for (let i = 0; i < n; i++) {
      let x = R(-w / 2, w / 2), y = R(-h / 2, h / 2), z = R(-d / 2, d / 2);
      const side = Math.floor(R(0, 6));
      if (side < 2) x = w / 2 * (side ? 1 : -1);
      else if (side < 4) y = h / 2 * (side === 3 ? 1 : -1);
      else z = d / 2 * (side === 5 ? 1 : -1);
      add(cx + x, cy + y, cz + z, col, 1.15);
    }
  }
  function sphere(cx, cy, cz, sx, sy, sz, n, col, motion = 0) {
    for (let i = 0; i < n; i++) {
      const a = R(0, TAU), u = R(-1, 1), v = Math.sqrt(1 - u * u);
      const rough = R(0.94, 1.06);
      add(cx + Math.cos(a) * v * sx * rough, cy + u * sy * rough, cz + Math.sin(a) * v * sz * rough, col, 1.1, motion);
    }
  }
  function branch(x, y, z, ex, ey, ez, r, n, col) {
    for (let i = 0; i < n; i++) {
      const t = rand(), a = R(0, TAU), rr = r * (1 - t * 0.8);
      add(x + (ex - x) * t + Math.cos(a) * rr, y + (ey - y) * t, z + (ez - z) * t + Math.sin(a) * rr, col, 1.1);
    }
  }
  // Uneven ground, a visually legible central path, farther hills.
  for (let i = 0; i < 36000; i++) {
    const x = R(-24, 24), z = R(-30, 18);
    const path = Math.abs(x - Math.sin(z * 0.17) * 1.8) < 2;
    const y = -1.7 + Math.sin(x * 0.43 + z * 0.18) * 0.3 + Math.cos(z * 0.48) * 0.18;
    const c = id === 'abyss' ? (path ? [0.43, 0.64, 0.61] : [0.2, 0.43, 0.41]) : path ? [0.57, 0.5, 0.32] : [0.22, 0.36, 0.23];
    add(x, y, z, c, path ? 1.05 : 1.35);
  }
  if (id === 'abyss') {
    // Submerged temple, terraces, fluted columns and arched openings.
    for (let i = 0; i < 4; i++) box(0, -1.45 + i * 0.24, -5, 13 - i * 0.65, 0.25, 12 - i * 0.65, 2700, stone);
    for (const x of [-5, 5]) for (const z of [-9, -4, 1]) {
      const height = z === 1 ? 5.9 : 7.2;
      box(x, -0.25, z, 1.6, 0.4, 1.6, 700, light);
      for (let i = 0; i < 4200; i++) {
        const a = R(0, TAU), y = R(-0.05, height), r = 0.47 + 0.035 * Math.sin(a * 16);
        add(x + Math.cos(a) * r, y, z + Math.sin(a) * r, stone, 1.05);
      }
      for (const y of [0.18, height - 0.18]) box(x, y, z, 1.2, 0.35, 1.2, 700, light);
      box(x, height + 0.2, z, 1.55, 0.42, 1.5, 850, stone);
    }
    // Central arch, repeated along depth. Each is a real 3D sampled volume.
    for (const z of [-9, -4]) {
      for (let i = 0; i < 10500; i++) {
        const angle = R(0, Math.PI), r = R(4.48, 5.14);
        add(Math.cos(angle) * r, 7 + Math.sin(angle) * r * 0.53, z + R(-0.47, 0.47), rand() < 0.08 ? light : stone, 1.05);
      }
    }
    // Gold orbit around a floating stone at the focal point.
    box(0, 0.1, -5, 2.4, 1.2, 2.4, 2400, stone);
    sphere(0, 2.3, -5, 0.55, 0.9, 0.55, 1900, light);
    for (let i = 0; i < 4600; i++) {
      const a = R(0, TAU), r = 1.75 + R(-0.035, 0.035);
      add(Math.cos(a) * r, 2.4 + Math.sin(a) * r, -5 + R(-0.025, 0.025), [0.96, 0.78, 0.4], 1.25, 0.08);
    }
    // Fallen rocks and sea fans at the edges.
    for (let j = 0; j < 24; j++) {
      const x = (rand() < 0.5 ? -1 : 1) * R(7, 18), z = R(-16, 10);
      sphere(x, -0.95, z, R(0.6, 1.6), R(0.5, 1.2), R(0.5, 1.4), 650, stone);
    }
    for (let j = 0; j < 32; j++) {
      const x = (rand() < 0.5 ? -1 : 1) * R(6, 15), z = R(-11, 12), h = R(1, 3);
      const col = j % 3 ? [0.28, 0.61, 0.53] : [0.65, 0.52, 0.36];
      for (let k = 0; k < 6; k++) {
        const dx = R(-1, 1), dz = R(-0.4, 0.4);
        branch(x, -1.4, z, x + dx, h - 1, z + dz, 0.06, 180, col);
        branch(x + dx * 0.5, (h - 1.4) * 0.5, z, x + dx * 1.7, h - 0.5, z + dz, 0.03, 100, col);
      }
    }
    // Soft diagonal shafts of light, made from suspended points.
    for (let i = 0; i < 4500; i++) {
      const y = R(0, 20), lane = Math.floor(R(0, 4));
      add(-10 + lane * 6 + y * 0.35 + R(-0.35, 0.35), y, -14 + R(-2, 2), [0.3, 0.55, 0.51], 0.7, 0.4);
    }
  } else {
    // Ferns, layered broadleaf trees, trunks and a path into a bright clearing.
    const trees = [[-5, 0, 13], [6, -3, 15], [-8, -9, 17], [8, -12, 14], [-4, -17, 13], [4, -23, 16], [-13, -2, 16], [13, 2, 15], [-10, -22, 17], [12, -24, 18], [-7, 7, 15], [10, 9, 16]];
    for (const [x, z, h] of trees) {
      const lean = R(-1.2, 1.2);
      branch(x, -1.6, z, x + lean, h, z - 0.6, R(0.5, 0.9), 4700, wood);
      for (let b = 0; b < 6; b++) {
        const a = R(0, TAU), y = R(h * 0.45, h * 0.85), r = R(2.2, 4.5);
        const ex = x + Math.cos(a) * r, ez = z + Math.sin(a) * r;
        branch(x, y, z, ex, y + 2, ez, 0.2, 600, wood);
        sphere(ex, y + 2.2, ez, R(1.7, 2.7), R(0.65, 1.2), R(1.4, 2.4), 950, leaf);
      }
      for (let b = 0; b < 5; b++) {
        const a = b / 5 * TAU;
        branch(x, -1.2, z, x + Math.cos(a) * 2.3, -1.55, z + Math.sin(a) * 2.3, 0.28, 400, wood);
      }
    }
    for (let j = 0; j < 64; j++) {
      const x = (rand() < 0.5 ? -1 : 1) * R(2.7, 16), z = R(-25, 14), s = R(0.5, 1.15);
      for (let k = 0; k < 7; k++) {
        const a = k / 7 * TAU;
        for (let i = 0; i < 75; i++) {
          const t = rand(), lateral = R(-0.32, 0.32) * Math.sin(t * Math.PI);
          add(x + (Math.cos(a) * t * 1.4 + Math.sin(a) * lateral) * s, -1.4 + Math.sin(t * Math.PI * 0.8) * s, z + (Math.sin(a) * t * 1.4 + Math.cos(a) * lateral) * s, leaf, 1.1);
        }
      }
    }
    for (let j = 0; j < 22; j++) {
      const x = R(-14, 14), z = R(-25, 12);
      if (Math.abs(x) < 2) continue;
      sphere(x, -1.05, z, R(0.5, 1.3), R(0.4, 0.8), R(0.4, 1.2), 650, [0.36, 0.46, 0.35]);
    }
    // Sun disk beyond the clearing, with airborne pollen.
    sphere(0, 7.2, -29, 2.25, 2.25, 0.12, 4400, [0.85, 0.76, 0.47]);
  }
  for (let i = 0; i < 1700; i++) add(R(-20, 20), R(-0.5, 17), R(-24, 14), id === 'abyss' ? [0.59, 0.83, 0.76] : [0.85, 0.8, 0.51], R(0.65, 1.7), 1);
  return new Float32Array(points);
}

const manifest = [];
for (const id of ['abyss', 'forest']) {
  const values = generate(id);
  await writeFile(new URL(`${id}.bin`, out), Buffer.from(values.buffer));
  // Portable binary PLY includes original positions and RGB for other viewers.
  const count = values.length / 8;
  const header = Buffer.from(`ply\nformat binary_little_endian 1.0\ncomment Original Mindscape procedural asset\nelement vertex ${count}\nproperty float x\nproperty float y\nproperty float z\nproperty uchar red\nproperty uchar green\nproperty uchar blue\nend_header\n`);
  const data = Buffer.alloc(count * 15);
  for (let i = 0; i < count; i++) {
    for (let k = 0; k < 3; k++) data.writeFloatLE(values[i * 8 + k], i * 15 + k * 4);
    for (let k = 0; k < 3; k++) data[i * 15 + 12 + k] = Math.round(values[i * 8 + 3 + k] * 255);
  }
  await writeFile(new URL(`${id}.ply`, out), Buffer.concat([header, data]));
  manifest.push({ id, count, bytes: values.byteLength, format: 'xyz-rgb-size-motion / float32', origin: 'original procedural point cloud', file: `${id}.bin` });
  console.log(`${id}: ${count.toLocaleString()} points / ${(values.byteLength / 1048576).toFixed(2)} MB`);
}
await writeFile(new URL('manifest.json', out), JSON.stringify(manifest, null, 2));
