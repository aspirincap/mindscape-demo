// Optional asset preparation; the generated WebPs are committed with the app.
// Requires cwebp. Uses the user's clean-front images without changing their content.
import { execFileSync } from 'node:child_process';
import { mkdir, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const source = resolve(process.argv[2] || resolve(root, 'artifacts/scene-clouds-20/previews'));
const target = resolve(root, 'public/shop/destinations');
await mkdir(target, { recursive: true });
let total = 0;
for (let number = 1; number <= 20; number++) {
  const id = String(number).padStart(2, '0');
  const output = resolve(target, `scene-${id}.webp`);
  execFileSync('cwebp', ['-quiet', '-q', '84', resolve(source, `${id}-clean-front.png`), '-o', output]);
  total += (await stat(output)).size;
}
console.log(`20 destination covers → ${target} (${Math.round(total / 1024)} KiB)`);
