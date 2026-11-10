#!/usr/bin/env node
/**
 * Static theme comparison: old app (mudrix-web/src/theme/themeTokens.ts) vs the new app's design
 * tokens (packages/design-tokens/src/themes/*.json). No browser. Writes out/themes.md.
 *
 *   node themes.mjs
 *
 * The old tokens are TypeScript, so themeTokens.ts is transpiled in memory with esbuild (from the
 * repo's node_modules) and imported from a data URL. Nothing is written outside tools/parity/out.
 *
 * Token mapping (old `color.*` key -> new token path under `color.`):
 *   bgPrimary -> bg.app          bgSecondary -> bg.surface     bgTertiary -> bg.raised
 *   bgInput -> bg.input          bgHover -> bg.hover           bgActive -> bg.active
 *   scrim.modal -> bg.overlay    accent -> accent.default      accentHover -> accent.hover
 *   bgAccentGlow1/2 -> accent.glow1/2                          link -> text.link
 *   onAccent -> text.onAccent    textPrimary/Muted/Secondary -> text.primary/muted/secondary
 *   border -> border.default     msgMineBg -> message.mine     msgOtherBg -> message.other
 *   mention/error/danger/success/warning -> status.*           logo.p0..p5/hover/hoverGlow -> logo.*
 * Old-only (not compared): accentRgb (derived from accent), shadow.*, scrim.{soft,base,deep,media},
 * radius.*, font.body (new keeps those in base.json, not per theme; a global section below lists
 * radius and scrim.modal against base.json). New-only tokens are listed once as a count/name list.
 * Themes are matched by lower-cased id (new: $extensions["org.wizardchat.theme"].id) / old name.
 * Colours are compared after parsing to rgba, so `#fff`, `#ffffff`, `rgb(255,255,255)` and
 * `rgba(255, 255, 255, 1)` are equal and `#E2BC8E99` equals `rgba(226, 188, 142, 0.6)`.
 */
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..');
const OLD_TOKENS = 'E:/code/web/mudrix-web/src/theme/themeTokens.ts';
const NEW_THEMES = join(repoRoot, 'packages', 'design-tokens', 'src', 'themes');
const NEW_BASE = join(repoRoot, 'packages', 'design-tokens', 'src', 'base.json');
const outDir = join(here, 'out');
mkdirSync(outDir, { recursive: true });

const require = createRequire(join(repoRoot, 'package.json'));
const esbuild = require('esbuild');

const MAP = {
  'color.bgPrimary': 'color.bg.app',
  'color.bgSecondary': 'color.bg.surface',
  'color.bgTertiary': 'color.bg.raised',
  'color.bgInput': 'color.bg.input',
  'color.bgHover': 'color.bg.hover',
  'color.bgActive': 'color.bg.active',
  'scrim.modal': 'color.bg.overlay',
  'color.accent': 'color.accent.default',
  'color.accentHover': 'color.accent.hover',
  'color.bgAccentGlow1': 'color.accent.glow1',
  'color.bgAccentGlow2': 'color.accent.glow2',
  'color.link': 'color.text.link',
  'color.onAccent': 'color.text.onAccent',
  'color.textPrimary': 'color.text.primary',
  'color.textMuted': 'color.text.muted',
  'color.textSecondary': 'color.text.secondary',
  'color.border': 'color.border.default',
  'color.msgMineBg': 'color.message.mine',
  'color.msgOtherBg': 'color.message.other',
  'color.mention': 'color.status.mention',
  'color.error': 'color.status.error',
  'color.danger': 'color.status.danger',
  'color.success': 'color.status.success',
  'color.warning': 'color.status.warning',
};
for (const k of ['p0', 'p1', 'p2', 'p3', 'p4', 'p5', 'hover', 'hoverGlow']) {
  MAP[`logo.${k}`] = `color.logo.${k}`;
}
const OLD_ONLY_IGNORED = new Set(['color.accentRgb']);

function flatten(node, path = []) {
  if (node && typeof node === 'object' && !('$value' in node)) {
    return Object.entries(node)
      .filter(([k]) => !k.startsWith('$'))
      .flatMap(([k, v]) => flatten(v, [...path, k]));
  }
  const value = node && typeof node === 'object' ? node.$value : node;
  return [[path.join('.'), value]];
}

function parseColor(input) {
  const s = String(input).trim().toLowerCase();
  let m = /^#([0-9a-f]{3,8})$/.exec(s);
  if (m) {
    let h = m[1];
    if (h.length === 3 || h.length === 4) h = [...h].map((c) => c + c).join('');
    if (h.length === 6) h += 'ff';
    if (h.length === 8) {
      const n = (i) => parseInt(h.slice(i, i + 2), 16);
      return [n(0), n(2), n(4), Math.round((n(6) / 255) * 1000) / 1000];
    }
  }
  m = /^rgba?\(([^)]+)\)$/.exec(s);
  if (m) {
    const p = m[1]
      .split(/[\s,/]+/)
      .filter(Boolean)
      .map(Number);
    return [p[0], p[1], p[2], Math.round((p[3] ?? 1) * 1000) / 1000];
  }
  return null;
}

const same = (a, b) => {
  const ca = parseColor(a);
  const cb = parseColor(b);
  if (ca && cb) {
    return ca.slice(0, 3).every((v, i) => v === cb[i]) && Math.abs(ca[3] - cb[3]) < 0.006;
  }
  return String(a).trim().toLowerCase() === String(b).trim().toLowerCase();
};

async function loadOld() {
  const ts = readFileSync(OLD_TOKENS, 'utf8');
  const { code } = esbuild.transformSync(ts, { loader: 'ts', format: 'esm' });
  const mod = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
  const themes = {};
  for (const [name, tokens] of Object.entries(mod.THEME_TOKENS)) {
    themes[name.toLowerCase()] = { name, tokens: Object.fromEntries(flatten(tokens)) };
  }
  return { themes, order: mod.BUILTIN_THEME_NAMES };
}

function loadNew() {
  const themes = {};
  for (const file of readdirSync(NEW_THEMES).filter((f) => f.endsWith('.json'))) {
    const json = JSON.parse(readFileSync(join(NEW_THEMES, file), 'utf8'));
    const meta = json.$extensions?.['org.wizardchat.theme'] ?? {};
    const id = (meta.id ?? file.replace(/\.json$/, '')).toLowerCase();
    themes[id] = { name: meta.name ?? id, tokens: Object.fromEntries(flatten(json)) };
  }
  return themes;
}

const { themes: oldThemes, order } = await loadOld();
const newThemes = loadNew();

const oldIds = Object.keys(oldThemes);
const newIds = Object.keys(newThemes);
const missingInNew = oldIds.filter((id) => !newIds.includes(id));
const missingInOld = newIds.filter((id) => !oldIds.includes(id));
const common = order.map((n) => n.toLowerCase()).filter((id) => newIds.includes(id));
for (const id of newIds) if (!common.includes(id) && oldIds.includes(id)) common.push(id);

const rows = []; // { theme, token, oldKey, oldValue, newValue }
const missingTokens = []; // { theme, oldKey, newKey, side }
const tally = new Map();
for (const id of common) {
  const o = oldThemes[id].tokens;
  const n = newThemes[id].tokens;
  for (const [oldKey, newKey] of Object.entries(MAP)) {
    if (!(oldKey in o)) {
      missingTokens.push({ theme: oldThemes[id].name, token: oldKey, side: 'old' });
      continue;
    }
    if (!(newKey in n)) {
      missingTokens.push({ theme: oldThemes[id].name, token: newKey, side: 'new' });
      continue;
    }
    if (!same(o[oldKey], n[newKey])) {
      rows.push({
        theme: oldThemes[id].name,
        token: `${oldKey} -> ${newKey}`,
        oldValue: o[oldKey],
        newValue: n[newKey],
      });
      tally.set(`${oldKey} -> ${newKey}`, (tally.get(`${oldKey} -> ${newKey}`) ?? 0) + 1);
    }
  }
}

const mappedNew = new Set(Object.values(MAP));
const sampleNew = newThemes[common[0]]?.tokens ?? {};
const newOnly = Object.keys(sampleNew).filter((k) => !mappedNew.has(k));
const oldOnly = Object.keys(oldThemes[common[0]]?.tokens ?? {}).filter(
  (k) => !(k in MAP) && !OLD_ONLY_IGNORED.has(k)
);

// Global (non-per-theme) values: old radius/scrim vs new base.json
const base = Object.fromEntries(flatten(JSON.parse(readFileSync(NEW_BASE, 'utf8'))));
const oldCarbon = oldThemes.carbon?.tokens ?? {};
const globalRows = [
  ['radius.sm', oldCarbon['radius.sm'], base['radius.sm']],
  ['radius.md', oldCarbon['radius.md'], base['radius.md']],
  ['radius.lg', oldCarbon['radius.lg'], `${base['radius.lg']} (radius.xl is ${base['radius.xl']})`],
  ['radius.pill', oldCarbon['radius.pill'], base['radius.pill']],
  [
    'shadow.menu / popover / popup',
    `${oldCarbon['shadow.menu']} | ${oldCarbon['shadow.popover']} | ${oldCarbon['shadow.popup']}`,
    `sm/md/lg: ${['sm', 'md', 'lg'].map((k) => JSON.stringify(base[`shadow.${k}`])).join(' ')}`,
  ],
  ['font.body', oldCarbon['font.body'], JSON.stringify(base['font.family.body'])],
];

const byTheme = new Map();
for (const r of rows) byTheme.set(r.theme, [...(byTheme.get(r.theme) ?? []), r]);

let md = `# Theme comparison (static)\n\nGenerated at: ${new Date().toISOString()}\n\n`;
md += `Old: \`mudrix-web/src/theme/themeTokens.ts\` (${oldIds.length} themes). New: \`packages/design-tokens/src/themes/*.json\` (${newIds.length} themes). Mapping is documented at the top of \`tools/parity/themes.mjs\`.\n\n`;
md += `## Summary\n\n`;
md += `- Themes in both: ${common.length}\n`;
md += `- Missing in new app: ${missingInNew.length ? missingInNew.map((i) => oldThemes[i].name).join(', ') : 'none'}\n`;
md += `- Missing in old app (new only): ${missingInOld.length ? missingInOld.map((i) => newThemes[i].name).join(', ') : 'none'}\n`;
md += `- Differing mapped tokens: ${rows.length} across ${byTheme.size} themes (of ${common.length * Object.keys(MAP).length} compared)\n`;
md += `- Mapped tokens absent on one side: ${missingTokens.length}\n\n`;

md += `### Differing tokens per theme\n\n| Theme | Differing | Of |\n| :--- | ---: | ---: |\n`;
for (const id of common) {
  const name = oldThemes[id].name;
  md += `| ${name} | ${(byTheme.get(name) ?? []).length} | ${Object.keys(MAP).length} |\n`;
}

md += `\n### Most recurring differing tokens\n\n| Token (old -> new) | Themes differing |\n| :--- | ---: |\n`;
for (const [token, count] of [...tally.entries()].sort((a, b) => b[1] - a[1])) {
  md += `| \`${token}\` | ${count} |\n`;
}

md += `\n### Tokens not compared\n\n- Old-only: ${oldOnly.map((k) => `\`${k}\``).join(', ') || 'none'} (+ \`color.accentRgb\`, derived)\n`;
md += `- New-only (no old equivalent): ${newOnly.map((k) => `\`${k}\``).join(', ') || 'none'}\n`;
if (missingTokens.length) {
  md += `- Mapped tokens absent on one side: ${missingTokens
    .map((m) => `${m.theme}:${m.token} (${m.side})`)
    .join(', ')}\n`;
}

md += `\n### Global values (Carbon in old vs base.json in new; not per theme in the new app)\n\n| Token | Old | New |\n| :--- | :--- | :--- |\n`;
for (const [k, o, n] of globalRows) md += `| \`${k}\` | \`${o}\` | \`${n}\` |\n`;

md += `\n## Differences by theme\n`;
for (const id of common) {
  const name = oldThemes[id].name;
  const list = byTheme.get(name) ?? [];
  md += `\n### ${name} (${list.length} differing)\n\n`;
  if (!list.length) {
    md += `No differences.\n`;
    continue;
  }
  md += `| Token | Old | New |\n| :--- | :--- | :--- |\n`;
  for (const r of list) md += `| \`${r.token}\` | \`${r.oldValue}\` | \`${r.newValue}\` |\n`;
}

const outFile = join(outDir, 'themes.md');
writeFileSync(outFile, md);
console.log(`Wrote ${outFile}`);
console.log(
  `themes common=${common.length} missingInNew=[${missingInNew}] missingInOld=[${missingInOld}] differing=${rows.length}`
);
