#!/usr/bin/env node
// One-off rename helper for the WizardChat -> Mudrix hard fork. Applies ordered text replacements to
// tracked text files and moves tracked paths with `git mv`.
//
//   node tools/rename/rename.mjs <stage> [--dry]
//
// Stages are defined in tools/rename/stages.mjs. Replacements are literal strings or RegExps; each
// stage can limit them to path prefixes and skip files.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stages } from './stages.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const [stageName, ...flags] = process.argv.slice(2);
const dry = flags.includes('--dry');
const stage = stages[stageName];
if (!stage) {
  console.error(`unknown stage "${stageName}"; stages: ${Object.keys(stages).join(', ')}`);
  process.exit(1);
}
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 1 << 28 });
const inScope = (file, prefixes) => !prefixes || prefixes.some((p) => file === p || file.startsWith(p));
const skipped = (file) => (stage.skip ?? []).some((s) => (s instanceof RegExp ? s.test(file) : file === s || file.startsWith(s)));
const BINARY = /\.(png|jpe?g|gif|webp|ico|icns|wav|mp3|ogg|ttf|otf|woff2?|jar|so|a|dylib|dll|zip|gz|keystore|jks|car|xcframework)$/i;

// 1. Content
let files = git('ls-files').split('\n').filter(Boolean);
let changedFiles = 0;
let replacements = 0;
for (const file of files) {
  if (BINARY.test(file) || skipped(file) || !inScope(file, stage.paths)) continue;
  const abs = join(root, file);
  if (!existsSync(abs)) continue;
  const before = readFileSync(abs, 'utf8');
  if (before.includes('\u0000')) continue;
  let after = before;
  for (const [from, to] of stage.replace ?? []) {
    if (typeof from === 'string') {
      const n = after.split(from).length - 1;
      if (n) {
        replacements += n;
        after = after.split(from).join(to);
      }
    } else {
      after = after.replace(from, (...m) => {
        replacements++;
        return typeof to === 'function' ? to(...m) : m[0].replace(from, to);
      });
    }
  }
  if (after !== before) {
    changedFiles++;
    if (!dry) writeFileSync(abs, after);
  }
}
console.log(`${stageName}: ${replacements} replacements in ${changedFiles} files${dry ? ' (dry run)' : ''}`);

// 2. Paths (longest prefix first so nested moves resolve)
files = git('ls-files').split('\n').filter(Boolean);
let moved = 0;
for (const [from, to] of [...(stage.move ?? [])].sort((a, b) => b[0].length - a[0].length)) {
  const matches = files.filter((f) => f === from || f.startsWith(from.endsWith('/') ? from : from + '/'));
  for (const f of matches) {
    const target = to + f.slice(from.length);
    if (dry) {
      moved++;
      continue;
    }
    mkdirSync(join(root, dirname(target)), { recursive: true });
    git('mv', f, target);
    moved++;
  }
  files = git('ls-files').split('\n').filter(Boolean);
}
console.log(`${stageName}: ${moved} paths moved${dry ? ' (dry run)' : ''}`);
