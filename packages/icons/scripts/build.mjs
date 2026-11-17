// Exports the shared art the native apps embed from the web app's originals:
//   dist/apple/Icons.xcassets/ph-<name>-<weight>.symbolset  custom SF Symbols, so they size with
//                                                            text, menus and labels like Apple's
//   dist/android/drawable/ph_<name>_<weight>.xml             vector drawables
//   dist/apple/Cosmetics.xcassets/cosmetic-*.imageset        the built-in cosmetics' art and effect strips for iOS
//   dist/ios/cosmetics.json                                  their ids, palettes and frame pieces for iOS
// Fails if an icon, weight or art file doesn't exist.
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pngSize, rasteriseSvg } from './svg-raster.mjs';

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
exportCosmetics();

/** The built-in decorations, nameplates, frames and effect strips from apps/web, as an iOS catalog and one JSON list */
function exportCosmetics() {
  const assets = join(root, '../../apps/web/public/assets');
  const manifests = join(root, '../../apps/web/src/util/builtinCosmetics');
  const problems = [];
  const images = new Map();
  const safeId = (id) => typeof id === 'string' && /^[a-z0-9-]{1,64}$/.test(id);

  const add = (name, file, maxWidth) => {
    if (images.has(name)) problems.push(`two cosmetics named ${name}`);
    const path = join(assets, `${file}`.replace(/^assets\//, ''));
    if (!existsSync(path)) {
      problems.push(`no such art: ${file}`);
      return null;
    }
    const cleaned = cosmeticSvg(readFileSync(path, 'utf8'));
    const original = svgSize(cleaned);
    if (!original) {
      problems.push(`no size in: ${file}`);
      return null;
    }
    // CoreSVG leaves <image> out, so a plate that embeds a bitmap is composited to a raster
    if (/<image\b/.test(cleaned)) {
      images.set(name, { png: rasteriseSvg(cleaned, original.width, original.height) });
      return original;
    }
    const { svg, size } = scaledSvg(cleaned, original, maxWidth);
    images.set(name, { svg });
    return size;
  };

  const addRaster = (name, file) => {
    if (images.has(name)) problems.push(`two cosmetics named ${name}`);
    const path = join(assets, `${file}`.replace(/^assets\//, ''));
    if (!existsSync(path)) {
      problems.push(`no such art: ${file}`);
      return null;
    }
    const png = readFileSync(path);
    const size = pngSize(png);
    if (!size) {
      problems.push(`not a PNG: ${file}`);
      return null;
    }
    images.set(name, { png });
    return size;
  };

  const decorations = readdirSync(join(assets, 'decorations'))
    .filter((file) => file.endsWith('.svg'))
    .map((file) => file.slice(0, -'.svg'.length))
    .filter((id) => {
      if (safeId(id)) return true;
      problems.push(`unsafe decoration id: ${id}`);
      return false;
    })
    .sort();

  const decorationArt = [];
  for (const id of decorations) {
    const image = `cosmetic-decorations-${id}`;
    if (add(image, `assets/decorations/${id}.svg`, 120)) decorationArt.push({ id, image });
  }

  const readJson = (name) => JSON.parse(readFileSync(join(manifests, name), 'utf8'));
  const nameplates = readJson('nameplates.json').flatMap((plate) => {
    if (!safeId(plate.id)) {
      problems.push(`unsafe nameplate id: ${plate.id}`);
      return [];
    }
    const image = `cosmetic-nameplates-${plate.id}`;
    const palette = typeof plate.palette === 'string' ? plate.palette : null;
    return add(image, plate.file, 400)
      ? [{ id: plate.id, name: plate.name ?? plate.id, palette, image }]
      : [];
  });

  const frames = readJson('frames.json').flatMap((frame) => {
    if (!safeId(frame.id)) {
      problems.push(`unsafe frame id: ${frame.id}`);
      return [];
    }
    const pieces = (frame.pieces ?? []).flatMap((piece) => {
      if (
        !['top', 'bottom', 'center'].includes(piece.pos) ||
        !['back', 'front'].includes(piece.layer)
      ) {
        problems.push(`bad piece: ${frame.id} ${piece.pos}/${piece.layer}`);
        return [];
      }
      const image = `cosmetic-frames-${frame.id}-${piece.pos}-${piece.layer}`;
      const size = add(image, piece.file, 400);
      return size
        ? [{ pos: piece.pos, layer: piece.layer, image, width: size.width, height: size.height }]
        : [];
    });
    return pieces.length ? [{ id: frame.id, name: frame.name ?? frame.id, pieces }] : [];
  });

  // The strips of the `eevee-stars` effect, which the web app also loads from the same folder
  addRaster('cosmetic-effects-eevee-anim', 'assets/effects/eevee-anim.png');
  addRaster('cosmetic-effects-eevee-anim-shiny', 'assets/effects/eevee-anim-shiny.png');

  if (problems.length) {
    console.error(problems.join('\n'));
    process.exit(1);
  }

  const catalog = join(dist, 'apple/Cosmetics.xcassets');
  mkdirSync(catalog, { recursive: true });
  writeFileSync(join(catalog, 'Contents.json'), json({ info }));
  for (const [name, art] of images) {
    const set = join(catalog, `${name}.imageset`);
    mkdirSync(set);
    if (art.png) {
      writeFileSync(join(set, 'art.png'), art.png);
      writeFileSync(
        join(set, 'Contents.json'),
        json({ images: [{ filename: 'art.png', idiom: 'universal' }], info })
      );
    } else {
      writeFileSync(join(set, 'art.svg'), art.svg);
      writeFileSync(
        join(set, 'Contents.json'),
        json({
          images: [{ filename: 'art.svg', idiom: 'universal' }],
          info,
          properties: { 'preserves-vector-representation': true },
        })
      );
    }
  }

  const ios = join(dist, 'ios');
  mkdirSync(ios, { recursive: true });
  writeFileSync(
    join(ios, 'cosmetics.json'),
    json({ decorations: decorationArt, nameplates, frames })
  );
  console.log(`cosmetics: ${images.size} imagesets exported`);
}

/** An SVG stripped of the web-only animation styles and blur filters no native renderer draws */
function cosmeticSvg(svg) {
  return svg
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/g, '')
    .replace(/<filter\b[^>]*>[\s\S]*?<\/filter>/g, '')
    .replace(/\s+filter="url\([^)]*\)"/g, '')
    .replace(/\s+style="[^"]*"/g, '');
}

/** An SVG's root size brought down to `maxWidth`, so actool does not rasterise it at poster size */
function scaledSvg(svg, size, maxWidth) {
  if (!(maxWidth > 0) || size.width <= maxWidth) return { svg, size };
  const factor = maxWidth / size.width;
  const width = Math.round(size.width * factor);
  const height = Math.round(size.height * factor);
  const root = /<svg\b[^>]*>/.exec(svg)?.[0] ?? '';
  const resized = root
    .replace(/\swidth="[\d.]+"/, ` width="${width}"`)
    .replace(/\sheight="[\d.]+"/, ` height="${height}"`);
  return { svg: svg.replace(root, resized), size: { width, height } };
}

/** The width and height an SVG asks to be drawn at, from its root tag or viewBox */
function svgSize(svg) {
  const tag = /<svg\b[^>]*>/.exec(svg)?.[0] ?? '';
  const width = /\swidth="([\d.]+)"/.exec(tag)?.[1];
  const height = /\sheight="([\d.]+)"/.exec(tag)?.[1];
  if (Number(width) > 0 && Number(height) > 0)
    return { width: Number(width), height: Number(height) };
  const box = /\sviewBox="([-\d.\s]+)"/.exec(tag)?.[1]?.trim().split(/\s+/).map(Number);
  if (box && box.length === 4 && box[2] > 0 && box[3] > 0) return { width: box[2], height: box[3] };
  return null;
}

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
