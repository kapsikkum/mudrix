// Exports the Phosphor icons the native apps use (src/icons.json) for each platform:
//   dist/apple/Icons.xcassets/ph-<name>-<weight>.symbolset  custom SF Symbols, so they size with
//                                                            text, menus and labels like Apple's
//   dist/android/drawable/ph_<name>_<weight>.xml             vector drawables
// Fails if an icon or weight in the list doesn't exist.
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
const svgPath = (name, weight) =>
  createRequire(import.meta.url).resolve(
    `@phosphor-icons/core/assets/${weight}/${weight === 'regular' ? name : `${name}-${weight}`}.svg`
  );
const WEIGHTS = ['thin', 'light', 'regular', 'bold', 'fill', 'duotone'];

// SF Symbols template v3 guides, in template units. iOS works out every weight and size from
// three small glyphs (Ultralight-S, Regular-S, Black-S), so those are all a symbol needs
const SCALES = [
  { id: 'S', baseline: 696, capline: 625.541, size: 84 },
  { id: 'M', baseline: 1126, capline: 1055.54, size: 100 },
  { id: 'L', baseline: 1556, capline: 1485.54, size: 124 },
];
// Phosphor's 256 grid becomes `size` units: icons come out about as big as Apple's next to text
// of the same size, centred on the capital letters
const LEFT = 1391.24;
// Phosphor has one stroke width per icon, so every weight gets the same outline; a symbol without
// glyphs to work a weight out from (say semibold) doesn't draw at all
const SYMBOL_WEIGHTS = ['Ultralight', 'Regular', 'Black'];
const GLYPH_SCALES = ['S'];

const icons = JSON.parse(readFileSync(join(root, 'src/icons.json'), 'utf8'));
const problems = [];
const seen = new Set();
const svgs = icons.flatMap(([name, weight]) => {
  const id = `${name}-${weight}`;
  if (seen.has(id)) problems.push(`listed twice: ${name} ${weight}`);
  seen.add(id);
  if (!WEIGHTS.includes(weight)) {
    problems.push(`unknown weight: ${name} ${weight}`);
    return [];
  }
  let file;
  try {
    file = svgPath(name, weight);
  } catch {
    file = null;
  }
  if (!file || !existsSync(file)) {
    problems.push(`no such icon: ${name} ${weight}`);
    return [];
  }
  return [{ name, weight, svg: readFileSync(file, 'utf8') }];
});
if (problems.length) {
  console.error(problems.join('\n'));
  process.exit(1);
}

rmSync(dist, { recursive: true, force: true });
const json = (value) => `${JSON.stringify(value, null, 2)}\n`;
const info = { author: 'xcode', version: 1 };

const catalog = join(dist, 'apple/Icons.xcassets');
mkdirSync(catalog, { recursive: true });
writeFileSync(join(catalog, 'Contents.json'), json({ info }));
for (const { name, weight, svg } of svgs) {
  const set = join(catalog, `ph-${name}-${weight}.symbolset`);
  mkdirSync(set);
  writeFileSync(join(set, 'icon.svg'), symbolTemplate(svg));
  writeFileSync(
    join(set, 'Contents.json'),
    json({ info, symbols: [{ filename: 'icon.svg', idiom: 'universal' }] })
  );
}

const drawables = join(dist, 'android/drawable');
mkdirSync(drawables, { recursive: true });
for (const { name, weight, svg } of svgs) {
  const paths = [...svg.matchAll(/<path d="([^"]+)"(?: opacity="([^"]+)")?\/>/g)]
    .map(([, d, opacity]) => {
      const alpha = opacity ? `\n        android:fillAlpha="${opacity}"` : '';
      return `    <path\n        android:fillColor="#FF000000"${alpha}\n        android:pathData="${d}" />`;
    })
    .join('\n');
  writeFileSync(
    join(drawables, `ph_${name.replaceAll('-', '_')}_${weight}.xml`),
    `<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="24dp"
    android:height="24dp"
    android:viewportWidth="256"
    android:viewportHeight="256">
${paths}
</vector>
`
  );
}

console.log(`icons: ${svgs.length} exported`);

/** One Phosphor SVG as a symbol template, the same outline in every weight and scale */
function symbolTemplate(svg) {
  const shapes = [...svg.matchAll(/<path d="([^"]+)"(?: opacity="([^"]+)")?\/>/g)];
  const guides = [];
  const glyphs = [];
  for (const { id, baseline, capline, size } of SCALES) {
    const scale = size / 256;
    const top = (baseline + capline) / 2 - 128 * scale;
    guides.push(guide(`Baseline-${id}`, baseline), guide(`Capline-${id}`, capline));
    const paths = shapes
      .map(([, d, opacity]) => {
        const attrs = opacity ? ` opacity="${opacity}"` : '';
        return `   <path d="${transformPath(d, scale, LEFT, top)}"${attrs}/>`;
      })
      .join('\n');
    if (!GLYPH_SCALES.includes(id)) continue;
    for (const weight of SYMBOL_WEIGHTS) {
      const name = `${weight}-${id}`;
      guides.push(
        margin(`left-margin-${name}`, LEFT, baseline),
        margin(`right-margin-${name}`, LEFT + size, baseline)
      );
      glyphs.push(`  <g id="${name}">\n${paths}\n  </g>`);
    }
  }
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg version="1.1" xmlns="http://www.w3.org/2000/svg" width="3300" height="2200">
 <g id="Notes">
  <text id="template-version" x="2953" y="70" font-size="13">Template v.3.0</text>
 </g>
 <g id="Guides">
${guides.join('\n')}
 </g>
 <g id="Symbols">
${glyphs.join('\n')}
 </g>
</svg>
`;
}

function guide(id, y) {
  return `  <path id="${id}" d="M 289.6 ${y} L 3010.4 ${y}" stroke="black"/>`;
}

function margin(id, x, baseline) {
  return `  <path id="${id}" d="M ${x} ${baseline - 96} L ${x} ${baseline + 24}" stroke="black"/>`;
}

/** Scales an SVG path by `s` and moves it by (tx, ty); handles every command, arcs included */
function transformPath(d, s, tx, ty) {
  const tokens = d.match(/[a-zA-Z]|-?(?:\d+\.?\d*|\.\d+)(?:e-?\d+)?/g);
  const arity = { M: 2, L: 2, T: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, A: 7, Z: 0 };
  const n = (v) => Number(v.toFixed(3));
  const out = [];
  let i = 0;
  let cmd = '';
  while (i < tokens.length) {
    if (/[a-zA-Z]/.test(tokens[i])) {
      cmd = tokens[i++];
      out.push(cmd);
      if (cmd.toUpperCase() === 'Z') continue;
    }
    const upper = cmd.toUpperCase();
    const rel = cmd !== upper;
    const args = tokens.slice(i, i + arity[upper]).map(Number);
    i += arity[upper];
    const x = (v) => n(rel ? v * s : v * s + tx);
    const y = (v) => n(rel ? v * s : v * s + ty);
    let mapped;
    switch (upper) {
      case 'H':
        mapped = [x(args[0])];
        break;
      case 'V':
        mapped = [y(args[0])];
        break;
      case 'A':
        mapped = [
          n(args[0] * s),
          n(args[1] * s),
          args[2],
          args[3],
          args[4],
          x(args[5]),
          y(args[6]),
        ];
        break;
      default:
        mapped = args.map((v, k) => (k % 2 === 0 ? x(v) : y(v)));
    }
    out.push(mapped.join(' '));
  }
  return out.join(' ');
}
