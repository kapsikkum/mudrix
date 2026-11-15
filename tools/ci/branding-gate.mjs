#!/usr/bin/env node
// Fails when the upstream name ("wizardchat", any case) shows up where users can see it.
//
//   node tools/ci/branding-gate.mjs             user-visible surfaces only (what CI runs today)
//   node tools/ci/branding-gate.mjs --strict    every tracked text file (for after the internal rename)
//
// Options: --root DIR (repo root), --allow FILE (allow-list, default tools/ci/branding-allow.txt).
// No dependencies; needs Node 22 and, for the file list, git (falls back to walking the tree).
//
// Default mode scans:
//   packages/i18n/locales/*.json         string VALUES only (keys are identifiers)
//   README*.md, docs/*.md                except docs that legitimately discuss upstream
//   apps/web/index.html, apps/web/public manifests
//   tauri*.conf.json                     productName, title, descriptions, publisher
//   Android                              android:label/description in manifests, strings*.xml bodies
//   iOS                                  Info.plist display names and usage descriptions, *.xcstrings values,
//                                        and the same keys when project.yml generates the Info.plist
//
// Allow-list lines (see branding-allow.txt):  <path glob> [:: <line regex, case-insensitive>]
// Every entry needs a reason: a `# why` comment line directly above it (covers following entries up to the
// next blank line) or an inline ` # why` at the end of the line.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const option = (name) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
};
if (argv.includes('--help') || argv.includes('-h')) {
  console.log(
    readFileSync(fileURLToPath(import.meta.url), 'utf8')
      .split('\n')
      .slice(1, 22)
      .map((l) => l.replace(/^\/\/ ?/, ''))
      .join('\n')
  );
  process.exit(0);
}
const strict = argv.includes('--strict');
const root = resolve(option('--root') ?? join(here, '..', '..'));
const allowFile = resolve(option('--allow') ?? join(here, 'branding-allow.txt'));
const PATTERN = /wizardchat/i;

// ---- globs -------------------------------------------------------------------------------------------------

function globToRegExp(glob) {
  let re = '';
  let braces = 0;
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*') {
      if (glob[i + 1] === '*') {
        i++;
        if (glob[i + 1] === '/') {
          i++;
          re += '(?:.*/)?';
        } else re += '.*';
      } else re += '[^/]*';
    } else if (c === '?') re += '[^/]';
    else if (c === '{') {
      braces++;
      re += '(?:';
    } else if (c === '}' && braces > 0) {
      braces--;
      re += ')';
    } else if (c === ',' && braces > 0) re += '|';
    else re += c.replace(/[.+^$()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${re}$`);
}
const matchesAny = (globs, path) => globs.some((g) => g.test(path));

// ---- allow-list --------------------------------------------------------------------------------------------

function loadAllowList(file) {
  if (!existsSync(file)) return [];
  const entries = [];
  let comment = null;
  readFileSync(file, 'utf8')
    .split(/\r?\n/)
    .forEach((raw, i) => {
      const line = raw.trim();
      if (!line) {
        comment = null;
        return;
      }
      if (line.startsWith('#')) {
        comment = line.slice(1).trim() || comment;
        return;
      }
      let spec = line;
      let why = comment;
      const inline = line.indexOf(' # ');
      if (inline >= 0) {
        spec = line.slice(0, inline).trim();
        why = line.slice(inline + 3).trim();
      }
      if (!why) {
        console.error(
          `${file}:${i + 1}: allow-list entry without a reason (add a "# why" comment above it)`
        );
        process.exit(2);
      }
      const split = spec.indexOf(' :: ');
      const glob = (split >= 0 ? spec.slice(0, split) : spec).trim();
      let rx = null;
      if (split >= 0) {
        try {
          rx = new RegExp(spec.slice(split + 4).trim(), 'i');
        } catch (error) {
          console.error(`${file}:${i + 1}: bad regex: ${error.message}`);
          process.exit(2);
        }
      }
      entries.push({ glob: globToRegExp(glob), rx, why, used: 0 });
    });
  return entries;
}
const allowList = loadAllowList(allowFile);

// ---- files -------------------------------------------------------------------------------------------------

function listFiles() {
  try {
    const out = execFileSync('git', ['ls-files', '-z'], {
      cwd: root,
      maxBuffer: 64 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return out
      .toString('utf8')
      .split('\0')
      .filter(Boolean)
      .filter((f) => existsSync(join(root, f)));
  } catch {
    const files = [];
    const skip = new Set([
      '.git',
      'node_modules',
      'target',
      'dist',
      'dist-desktop',
      'build',
      'graphify-out',
    ]);
    const walk = (dir, prefix) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (entry.isDirectory()) {
          if (!skip.has(entry.name)) walk(join(dir, entry.name), `${prefix}${entry.name}/`);
        } else files.push(`${prefix}${entry.name}`);
      }
    };
    walk(root, '');
    return files;
  }
}
const read = (file) => readFileSync(join(root, file), 'utf8');
const lineOf = (text, index) => text.slice(0, index).split('\n').length;

// ---- logo art ----------------------------------------------------------------------------------------------
// The old upstream mark is a purple hexagon-looking shape; the Mudrix mark is the brown faceted mound. Neither
// contains the word "wizardchat", so the name scan cannot see a splash logo left behind. The checks below know
// the mound's colours (read from logo.svg itself) and one of its facet geometries.

const LOGO_FILE = 'apps/web/public/assets/images/logo.svg';
const MUD_MOUND_FACET = '60,200 130,120 125,205'; // first facet in theme/mudMoundGeometry.ts
const logoText = existsSync(join(root, LOGO_FILE)) ? read(LOGO_FILE) : '';
const logoColours = new Set(
  (logoText.match(/#[0-9a-f]{6}(?:[0-9a-f]{2})?/gi) ?? []).map((c) => c.toLowerCase())
);

/** Every static logo asset (all themes) must be the Mudrix mound, not the upstream mark. */
function checkLogoAssets(files) {
  const logos = files.filter((f) => /^apps\/web\/public\/assets\/images\/logo[^/]*\.svg$/i.test(f));
  for (const file of logos) {
    if (!read(file).includes(MUD_MOUND_FACET)) {
      hits.push({
        file,
        line: 1,
        text: 'logo is not the Mudrix mound (facet geometry missing)',
        where: 'web logo',
      });
    }
  }
  if (!logoText || !logoColours.has('#9a6f47')) {
    hits.push({
      file: LOGO_FILE,
      line: 1,
      text: 'logo.svg is missing or has no Mudrix mound palette',
      where: 'web logo',
    });
  }
}

/**
 * Logo-sized inline SVGs in a web page must use the Mudrix palette (or currentColor / theme variables). This
 * catches the old upstream splash mark, which had its own purple palette and no name in the markup.
 */
function checkInlineSvg(file, text, where) {
  for (const match of text.matchAll(/<svg\b[^>]*>[\s\S]*?<\/svg>/gi)) {
    const block = match[0];
    const width = /\bwidth\s*=\s*["']?([\d.]+)/i.exec(block)?.[1];
    const height = /\bheight\s*=\s*["']?([\d.]+)/i.exec(block)?.[1];
    const viewBox = /\bviewBox\s*=\s*["']([^"']+)/i.exec(block)?.[1]?.trim();
    const logoShaped = Number(width) >= 48 || Number(height) >= 48 || viewBox === '0 0 400 400';
    if (!logoShaped) continue;
    const colours = block.match(/#[0-9a-f]{6}(?:[0-9a-f]{2})?/gi) ?? [];
    if (colours.length && !colours.some((c) => logoColours.has(c.toLowerCase()))) {
      hits.push({
        file,
        line: lineOf(text, match.index),
        text: `inline SVG is not the Mudrix mark (palette ${[...new Set(colours)].slice(0, 4).join(', ')})`,
        where,
      });
    }
  }
}

// ---- hits --------------------------------------------------------------------------------------------------

const hits = [];
let allowed = 0;

function check(file, line, text, where) {
  if (!PATTERN.test(text)) return;
  const entry = allowList.find((e) => e.glob.test(file) && (!e.rx || e.rx.test(text)));
  if (entry) {
    entry.used++;
    allowed++;
    return;
  }
  hits.push({ file, line, text: text.trim().slice(0, 200), where });
}

const checkLines = (file, text, where) =>
  text.split('\n').forEach((l, i) => check(file, i + 1, l, where));

/** Every string in a JSON document that sits under one of `keys`, or all string values when `keys` is null */
function checkJson(file, text, where, { keys = null, includeKeys = false } = {}) {
  let data;
  try {
    data = JSON.parse(text);
  } catch (error) {
    hits.push({ file, line: 1, text: `not valid JSON: ${error.message}`, where: 'parse' });
    return;
  }
  const lines = text.split('\n');
  const locate = (value) => {
    const needle = JSON.stringify(value);
    const i = lines.findIndex((l) => l.includes(needle));
    return i >= 0 ? i + 1 : 1;
  };
  const visit = (node, key) => {
    if (typeof node === 'string') {
      if (!keys || keys.has(key)) check(file, locate(node), node, `${where} ${key ?? ''}`.trim());
    } else if (Array.isArray(node)) node.forEach((n) => visit(n, key));
    else if (node && typeof node === 'object') {
      for (const [k, v] of Object.entries(node)) {
        if (includeKeys) check(file, locate(k), k, `${where} key`);
        visit(v, k);
      }
    }
  };
  visit(data, null);
}

// ---- default mode: user-visible surfaces ---------------------------------------------------------------

const DOCS_ABOUT_UPSTREAM = new Set([
  'BRANDING.md',
  'PORT.md',
  'MISSING.md',
  'PARITY_PLAN.md',
  'PARITY_MATRIX.md',
  'SECRETS.md',
  'DECISIONS.md',
  'UPSTREAM_SYNC.md',
  'CONTRIBUTING.md',
]);
const PLIST_KEYS = (key) =>
  /^(CFBundleDisplayName|CFBundleName|NSHumanReadableCopyright|NS\w+UsageDescription)$/.test(key);
const TAURI_KEYS = new Set([
  'productName',
  'title',
  'shortDescription',
  'longDescription',
  'publisher',
  'copyright',
]);

const surfaces = [
  {
    where: 'translation',
    test: (f) => /^packages\/i18n\/locales\/[^/]+\.json$/.test(f),
    scan: (f, t) => checkJson(f, t, 'translation'),
  },
  {
    where: 'readme',
    test: (f) => /^README[^/]*\.md$/i.test(f),
    scan: (f, t) => checkLines(f, t, 'readme'),
  },
  {
    where: 'doc',
    test: (f) => /^docs\/[^/]+\.md$/.test(f) && !DOCS_ABOUT_UPSTREAM.has(f.slice(5)),
    scan: (f, t) => checkLines(f, t, 'doc'),
  },
  {
    where: 'web page',
    test: (f) =>
      f === 'apps/web/index.html' ||
      // public HTML and update-feed YAML are user-facing too (the old splash and desktop feeds lived here)
      /^apps\/web\/public\/.*\.(?:html|ya?ml)$/i.test(f) ||
      /^apps\/web\/public\/(?:.*\/)?(?:manifest[^/]*|[^/]*\.webmanifest)$/.test(f),
    scan: (f, t) => {
      checkLines(f, t, 'web page');
      if (/\.html$/i.test(f)) checkInlineSvg(f, t, 'web page');
    },
  },
  {
    where: 'tauri',
    test: (f) => /^apps\/desktop\/src-tauri\/tauri[^/]*\.conf\.json$/.test(f),
    scan: (f, t) => checkJson(f, t, 'tauri', { keys: TAURI_KEYS }),
  },
  {
    where: 'android manifest',
    test: (f) => /^apps\/android\/.*AndroidManifest\.xml$/.test(f) && !f.includes('/build/'),
    scan: (f, t) => {
      for (const m of t.matchAll(/android:(?:label|description)\s*=\s*"([^"]*)"/g))
        check(f, lineOf(t, m.index), m[1], 'android manifest label');
    },
  },
  {
    where: 'android strings',
    test: (f) =>
      /^apps\/android\/.*\/res\/values[^/]*\/strings[^/]*\.xml$/.test(f) && !f.includes('/build/'),
    scan: (f, t) => {
      for (const m of t.matchAll(/<string\b[^>]*>([\s\S]*?)<\/string>/g))
        check(f, lineOf(t, m.index), m[1], 'android string');
    },
  },
  {
    where: 'ios plist',
    test: (f) => /^apps\/ios\/.*Info\.plist$/.test(f),
    scan: (f, t) => {
      for (const m of t.matchAll(/<key>([^<]+)<\/key>\s*<string>([^<]*)<\/string>/g)) {
        if (PLIST_KEYS(m[1])) check(f, lineOf(t, m.index), m[2], `ios ${m[1]}`);
      }
    },
  },
  {
    where: 'ios localized strings',
    test: (f) => /^apps\/ios\/.*\.xcstrings$/.test(f),
    scan: (f, t) => checkJson(f, t, 'ios strings', { keys: new Set(['value']) }),
  },
  {
    // project.yml generates the app's Info.plist (GENERATE_INFOPLIST_FILE), so these keys are what users see
    where: 'ios project.yml',
    test: (f) => f === 'apps/ios/project.yml',
    scan: (f, t) =>
      t.split('\n').forEach((l, i) => {
        const m = l.match(
          /^\s*(?:INFOPLIST_KEY_)?(CFBundleDisplayName|CFBundleName|NS\w+UsageDescription)\s*:\s*(.*)$/
        );
        if (m) check(f, i + 1, m[2], `ios ${m[1]}`);
      }),
  },
];

// ---- strict mode: everything -------------------------------------------------------------------------------

const STRICT_SKIP = [
  // legitimately about upstream
  'LICENSE',
  'CONTRIBUTING.md',
  'docs/{BRANDING,PORT,MISSING,PARITY_PLAN,PARITY_MATRIX,SECRETS,DECISIONS,UPSTREAM_SYNC}.md',
  // this gate and its allow-list name the string by design
  'tools/ci/branding-*',
  // upstream's GitLab files, deleted once GitHub Actions replaces them
  '.gitlab-ci.yml',
  '.gitlab/**',
  'graphify-out/**',
].map(globToRegExp);
const BINARY_EXT =
  /\.(png|jpe?g|gif|webp|ico|icns|car|ttf|otf|woff2?|wav|mp3|ogg|mp4|webm|pdf|zip|gz|jar|aar|so|a|dylib|dll|exe|wasm|keystore|jks|xcframework)$/i;

function scanStrict(files) {
  for (const file of files) {
    if (matchesAny(STRICT_SKIP, file) || BINARY_EXT.test(file)) continue;
    const full = join(root, file);
    if (statSync(full).size > 2 * 1024 * 1024) continue;
    const buf = readFileSync(full);
    if (buf.subarray(0, 8192).includes(0)) continue;
    const text = buf.toString('utf8');
    checkLines(file, text, 'strict');
    if (/\.html$/i.test(file)) checkInlineSvg(file, text, 'strict');
  }
}

// ---- run ---------------------------------------------------------------------------------------------------

const files = listFiles();
checkLogoAssets(files);
if (strict) scanStrict(files);
else {
  for (const file of files) {
    const surface = surfaces.find((s) => s.test(file));
    if (surface) surface.scan(file, read(file));
  }
}

const github = process.env.GITHUB_ACTIONS === 'true';
const escape = (s) => s.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
for (const hit of hits) {
  console.log(`${hit.file}:${hit.line}: [${hit.where}] ${hit.text}`);
  if (github)
    console.log(
      `::error file=${hit.file},line=${hit.line},title=Branding gate::${escape(`"wizardchat" in ${hit.where}: ${hit.text}`)}`
    );
}
if (strict) {
  for (const entry of allowList.filter((e) => !e.used)) {
    console.log(
      `note: unused allow-list entry ${entry.glob.source}${entry.rx ? ` :: ${entry.rx.source}` : ''}`
    );
  }
}
console.log(
  `\nbranding gate (${strict ? 'strict' : 'user-visible'}): ${hits.length} hit(s), ${allowed} allowed, ${files.length} files listed`
);
process.exit(hits.length ? 1 : 0);
