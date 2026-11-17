#!/usr/bin/env node
/**
 * Puts old | new (| diff at 390) next to each other in one image for eyeballing:
 *   node side.mjs <screen-id> <width>[,<width>...]   ->  out/side/<id>-<width>.png
 * Wide captures are shrunk (nearest neighbour) so the combined image is at most ~1600px wide.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, 'out');
mkdirSync(join(out, 'side'), { recursive: true });
const [id, widths = '1440'] = process.argv.slice(2);

for (const width of widths.split(',')) {
  const names = [
    join(out, 'old', `${id}-${width}.png`),
    join(out, 'new', `${id}-${width}.png`),
    ...(Number(width) <= 390 ? [join(out, 'diff', `${id}-${width}.png`)] : []),
  ];
  const imgs = names.map((f) => PNG.sync.read(readFileSync(f)));
  const gap = 8;
  const rawW = imgs.reduce((a, i) => a + i.width, 0) + gap * (imgs.length - 1);
  const scale = Math.min(1, 1600 / rawW);
  const h = Math.max(...imgs.map((i) => i.height));
  const outW = Math.round(rawW * scale);
  const outH = Math.round(h * scale);
  const dst = new PNG({ width: outW, height: outH });
  dst.data.fill(255);
  let x0 = 0;
  for (const img of imgs) {
    for (let y = 0; y < Math.round(img.height * scale); y++) {
      for (let x = 0; x < Math.round(img.width * scale); x++) {
        const sx = Math.min(img.width - 1, Math.floor(x / scale));
        const sy = Math.min(img.height - 1, Math.floor(y / scale));
        const s = (img.width * sy + sx) << 2;
        const d = (outW * y + x0 + x) << 2;
        for (let k = 0; k < 4; k++) dst.data[d + k] = img.data[s + k];
      }
    }
    x0 += Math.round((img.width + gap) * scale);
  }
  const file = join(out, 'side', `${id}-${width}.png`);
  writeFileSync(file, PNG.sync.write(dst));
  console.log(file);
}
