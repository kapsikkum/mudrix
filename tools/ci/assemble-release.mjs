// Assembles the files a GitHub release ships from the artifacts of one CI run: the desktop
// installers and updater bundles, the signed Android APK, the unsigned iOS IPA, the Flatpak and
// the Linux tarball and distro packages. It also writes `latest.json` (the feed the desktop
// updater reads) and `SHA256SUMS`. `release.yml` calls it with the artifacts of the tag run;
// RELEASING.md describes how to run it by hand.
//
// Usage:
//   node tools/ci/assemble-release.mjs --artifacts <dir> --out <dir> --version 26.12.5 \
//     [--tag v26.12.5] [--repo owner/name] [--prerelease] [--dry-run]
//
// `--artifacts` is the tree `actions/download-artifact` writes: one directory per artifact name.
// Every input is found by file name, so the layout inside an artifact does not matter. A missing
// input is an error: a release is never published with a hole in it. `--dry-run` prints the plan
// without writing or hashing.
import { createHash } from 'node:crypto';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { basename, join, resolve } from 'node:path';

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  return i === -1 ? undefined : args[i + 1];
};
const has = (name) => args.includes(name);

const version = (flag('--version') ?? '').replace(/^v/, '');
const tag = flag('--tag') ?? `v${version}`;
const repo = flag('--repo') ?? 'kapsikkum/mudrix';
const artifacts = flag('--artifacts');
const out = flag('--out');
const dryRun = has('--dry-run');
// A pre-release tag carries a suffix (26.12.6-next.1). WiX only takes numeric versions and deb/rpm
// reject a '-' in the version, so those three are left out, as RELEASING.md says.
const prerelease = has('--prerelease') || version.includes('-');

if (!/^\d+\.\d+\.\d+(-[0-9A-Za-z]+(\.[0-9A-Za-z]+)*)?$/.test(version)) {
  console.error(`"${version}" is not a version`);
  process.exit(1);
}
if (!artifacts || !out) {
  console.error('usage: assemble-release.mjs --artifacts <dir> --out <dir> --version <v>');
  process.exit(1);
}
if (!existsSync(artifacts)) {
  console.error(`no artifact directory at ${artifacts}`);
  process.exit(1);
}

/** Every file under `artifacts`, keyed by base name (the first one wins). */
function index(root) {
  const files = new Map();
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (!files.has(entry.name)) files.set(entry.name, path);
    }
  };
  walk(root);
  return files;
}

const find = (files, ...names) => {
  for (const name of names) {
    const path = typeof name === 'string' ? files.get(name) : undefined;
    if (path) return path;
  }
  return undefined;
};
const findMatching = (files, test) => [...files].find(([name]) => test(name))?.[1];

const files = index(resolve(artifacts));

/**
 * The release's files. `name` is the name on the release page; `required` says whether its
 * absence fails the run. `signature` marks the updater bundle whose `.sig` goes into latest.json,
 * next to the platform that updates from it.
 */
const wanted = [
  {
    name: `Mudrix_${version}_x64-setup.exe`,
    sources: [`Mudrix_${version}_x64-setup.exe`],
    required: true,
  },
  {
    name: `Mudrix_${version}_x64_en-US.msi`,
    sources: [`Mudrix_${version}_x64_en-US.msi`],
    required: !prerelease,
  },
  {
    name: `Mudrix_${version}_aarch64.dmg`,
    sources: [`Mudrix_${version}_aarch64.dmg`],
    required: true,
  },
  { name: `Mudrix.app.tar.gz`, sources: ['Mudrix.app.tar.gz'], required: true },
  {
    name: `Mudrix_${version}_amd64.AppImage`,
    sources: [`Mudrix_${version}_amd64.AppImage`],
    required: true,
  },
  {
    name: `Mudrix_${version}_amd64.deb`,
    sources: [`Mudrix_${version}_amd64.deb`],
    required: !prerelease,
  },
  {
    name: `mudrix-${version}-1.fc45.x86_64.rpm`,
    sources: [`mudrix-${version}-1.fc45.x86_64.rpm`],
    match: (name) => /^mudrix-\d+\.\d+\.\d+-[0-9.]+\.fc\d+\.x86_64\.rpm$/.test(name),
    required: !prerelease,
  },
  {
    name: `mudrix-${version}-linux-x86_64.tar.gz`,
    sources: [`mudrix-${version}-linux-x86_64.tar.gz`],
    match: (name) => /^mudrix-\d+\.\d+\.\d+-linux-x86_64\.tar\.gz$/.test(name),
    required: true,
  },
  {
    name: `Mudrix-${version}-release.apk`,
    sources: [`Mudrix-${version}-release.apk`],
    required: true,
  },
  { name: 'Mudrix-unsigned.ipa', sources: ['Mudrix-unsigned.ipa'], required: true },
  {
    name: `mudrix-${version}.flatpak`,
    sources: [`mudrix-${version}.flatpak`, 'mudrix.flatpak'],
    match: (name) => name.endsWith('.flatpak'),
    required: true,
  },
];

const plan = [];
const missing = [];
for (const item of wanted) {
  const path =
    find(files, ...item.sources) ?? (item.match ? findMatching(files, item.match) : undefined);
  if (!path) {
    if (item.required) missing.push(item.name);
    continue;
  }
  plan.push({ ...item, path });
}
if (missing.length > 0) {
  console.error(`missing release file(s): ${missing.join(', ')}`);
  console.error(`artifact directory: ${resolve(artifacts)}`);
  console.error(`files found: ${[...files.keys()].sort().join(', ')}`);
  process.exit(1);
}

/**
 * The updater signature for `path`. On macOS the `.sig` sits beside the bundle, but the Windows and
 * Linux signers upload theirs in a separate `mudrix-desktop-updater-*` artifact, so look the file up
 * by name anywhere in the tree.
 */
function signatureFor(path) {
  const sig = files.get(`${basename(path)}.sig`);
  if (!sig) return null;
  const text = readFileSync(sig, 'utf8').trim();
  return text === '' ? null : text;
}

const updater = {
  'windows-x86_64': plan.find((item) => item.name.endsWith('-setup.exe')),
  'darwin-aarch64': plan.find((item) => item.name === 'Mudrix.app.tar.gz'),
  'linux-x86_64': plan.find((item) => item.name.endsWith('.AppImage')),
};

const latest = {
  version,
  notes: `Mudrix ${version}`,
  pub_date: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
  platforms: {},
};
const failures = [];
for (const [platform, item] of Object.entries(updater)) {
  const signature = signatureFor(item.path);
  if (!signature) {
    failures.push(`no signature next to ${item.name}`);
    continue;
  }
  latest.platforms[platform] = {
    signature,
    url: `https://github.com/${repo}/releases/download/${tag}/${encodeURIComponent(item.name)}`,
  };
}
if (failures.length > 0) {
  console.error(`updater bundles are not signed: ${failures.join('; ')}`);
  process.exit(1);
}

if (dryRun) {
  for (const item of plan) console.log(`would ship ${item.name}  <- ${item.path}`);
  if (!prerelease)
    console.log(`would ship latest.json (${Object.keys(latest.platforms).join(', ')})`);
  console.log('would ship SHA256SUMS');
  process.exit(0);
}

mkdirSync(out, { recursive: true });
const shipped = [];
for (const item of plan) {
  if (basename(item.path) !== item.name && existsSync(join(out, item.name))) {
    console.error(`refusing to overwrite ${join(out, item.name)}`);
    process.exit(1);
  }
  copyFileSync(item.path, join(out, item.name));
  shipped.push(item.name);
}
// A pre-release is never offered to the updater: it reads releases/latest/download/latest.json and
// GitHub's "latest" ignores pre-releases, so there is nothing to point it at.
if (!prerelease) {
  writeFileSync(join(out, 'latest.json'), `${JSON.stringify(latest, null, 2)}\n`);
  shipped.push('latest.json');
}

/** `sha256sum` format: the digest, two spaces, the file name. Sorted, so the file is reproducible. */
const sums = shipped
  .sort()
  .map(
    (name) =>
      `${createHash('sha256')
        .update(readFileSync(join(out, name)))
        .digest('hex')}  ${name}`
  )
  .join('\n');
writeFileSync(join(out, 'SHA256SUMS'), `${sums}\n`);

console.log(`assembled ${shipped.length + 1} files in ${resolve(out)}`);
for (const name of [...shipped].sort()) console.log(`  ${name}`);
