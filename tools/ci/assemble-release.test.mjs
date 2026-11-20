// Tests for tools/ci/assemble-release.mjs: run with `node --test tools/ci/`.
// Each test builds a small tree shaped like `actions/download-artifact` output, runs the script and
// checks the release directory it writes.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const script = join(dirname(fileURLToPath(import.meta.url)), 'assemble-release.mjs');
const VERSION = '26.12.6';

/** Writes one artifact directory per entry, with the file paths the workflows upload. */
function fixture(files) {
  const root = mkdtempSync(join(tmpdir(), 'assemble-release-'));
  const artifacts = join(root, 'artifacts');
  const out = join(root, 'out');
  for (const [artifact, entries] of Object.entries(files)) {
    for (const [path, content] of Object.entries(entries)) {
      const full = join(artifacts, artifact, path);
      mkdirSync(dirname(full), { recursive: true });
      writeFileSync(full, content);
    }
  }
  return { artifacts, out };
}

/** The uploads of a full, stable desktop + mobile run, minus whatever the caller removes. */
function stableFiles(version = VERSION, { dmg = true, msi = true, distro = true } = {}) {
  const files = {
    'mudrix-desktop-Windows-release': {
      [`nsis/Mudrix_${version}_x64-setup.exe`]: 'setup',
      [`msi/Mudrix_${version}_x64_en-US.msi`]: 'msi',
    },
    'mudrix-desktop-updater-Windows': {
      [`nsis/Mudrix_${version}_x64-setup.exe.sig`]: 'untrusted comment: windows\n',
    },
    'mudrix-desktop-macOS-release': {
      [`dmg/Mudrix_${version}_aarch64.dmg`]: 'dmg',
    },
    'mudrix-desktop-updater-macOS': {
      'macos/Mudrix.app.tar.gz': 'app',
      'macos/Mudrix.app.tar.gz.sig': 'untrusted comment: macos\n',
    },
    'mudrix-desktop-Linux-release': {
      [`appimage/Mudrix_${version}_amd64.AppImage`]: 'appimage',
      [`deb/Mudrix_${version}_amd64.deb`]: 'deb',
    },
    'mudrix-desktop-updater-Linux': {
      [`appimage/Mudrix_${version}_amd64.AppImage.sig`]: 'untrusted comment: linux\n',
    },
    'mudrix-fedora-package': {
      [`mudrix-${version}-1.fc45.x86_64.rpm`]: 'rpm',
    },
    'mudrix-linux-tarball': {
      [`mudrix-${version}-linux-x86_64.tar.gz`]: 'tarball',
    },
    'mudrix-android-fdroid-release': {
      [`Mudrix-${version}-release.apk`]: 'apk',
    },
    'mudrix-ios-unsigned-ipa': {
      'Mudrix-unsigned.ipa': 'ipa',
    },
    [`mudrix-flatpak-${version}`]: {
      'mudrix.flatpak': 'flatpak',
    },
  };
  if (!dmg) delete files['mudrix-desktop-macOS-release'];
  if (!msi) delete files['mudrix-desktop-Windows-release'][`msi/Mudrix_${version}_x64_en-US.msi`];
  if (!distro) {
    delete files['mudrix-desktop-Linux-release'][`deb/Mudrix_${version}_amd64.deb`];
    delete files['mudrix-fedora-package'];
  }
  return files;
}

const run = (args) =>
  execFileSync(process.execPath, [script, ...args], { encoding: 'utf8', stdio: 'pipe' });

const runFailing = (args) => {
  try {
    run(args);
  } catch (error) {
    return { status: error.status, stderr: String(error.stderr) };
  }
  assert.fail('the script should have failed');
};

const names = (out) =>
  readFileSync(join(out, 'SHA256SUMS'), 'utf8')
    .trim()
    .split('\n')
    .map((line) => line.slice(66));

test('stable run ships every file, latest.json and a sorted SHA256SUMS', () => {
  const { artifacts, out } = fixture(stableFiles());
  run(['--artifacts', artifacts, '--out', out, '--version', VERSION, '--tag', `v${VERSION}`]);

  assert.deepEqual(names(out), [
    'Mudrix-26.12.6-release.apk',
    'Mudrix-unsigned.ipa',
    'Mudrix.app.tar.gz',
    'Mudrix_26.12.6_aarch64.dmg',
    'Mudrix_26.12.6_amd64.AppImage',
    'Mudrix_26.12.6_amd64.deb',
    'Mudrix_26.12.6_x64-setup.exe',
    'Mudrix_26.12.6_x64_en-US.msi',
    'latest.json',
    'mudrix-26.12.6-1.fc45.x86_64.rpm',
    'mudrix-26.12.6-linux-x86_64.tar.gz',
    'mudrix-26.12.6.flatpak',
  ]);
  for (const line of readFileSync(join(out, 'SHA256SUMS'), 'utf8').trim().split('\n')) {
    assert.match(line, /^[0-9a-f]{64} {2}\S+$/);
  }
  // The .sig files are part of latest.json, not release assets.
  assert.equal(
    names(out).some((name) => name.endsWith('.sig')),
    false
  );

  const latest = JSON.parse(readFileSync(join(out, 'latest.json'), 'utf8'));
  assert.equal(latest.version, VERSION);
  assert.equal(latest.notes, `Mudrix ${VERSION}`);
  assert.match(latest.pub_date, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
  assert.deepEqual(Object.keys(latest.platforms).sort(), [
    'darwin-aarch64',
    'linux-x86_64',
    'windows-x86_64',
  ]);
  assert.equal(
    latest.platforms['windows-x86_64'].url,
    `https://github.com/kapsikkum/mudrix/releases/download/v${VERSION}/Mudrix_${VERSION}_x64-setup.exe`
  );
  assert.equal(latest.platforms['darwin-aarch64'].signature, 'untrusted comment: macos');
  assert.equal(
    latest.platforms['linux-x86_64'].url,
    `https://github.com/kapsikkum/mudrix/releases/download/v${VERSION}/Mudrix_${VERSION}_amd64.AppImage`
  );
});

test('a pre-release skips the msi, deb, rpm and latest.json', () => {
  const version = `${VERSION}-next.1`;
  // A pre-release build produces no msi, deb or rpm at all.
  const { artifacts, out } = fixture(stableFiles(version, { msi: false, distro: false }));
  run([
    '--artifacts',
    artifacts,
    '--out',
    out,
    '--version',
    version,
    '--tag',
    `v${version}`,
    '--prerelease',
  ]);
  const shipped = names(out);
  assert.equal(
    shipped.some((name) => /\.(msi|deb|rpm)$/.test(name)),
    false
  );
  assert.equal(shipped.includes('latest.json'), false);
  assert.equal(shipped.includes('Mudrix.app.tar.gz'), true);
});

test('a missing required file fails and names what is missing', () => {
  const { artifacts, out } = fixture(stableFiles(VERSION, { dmg: false }));
  const { status, stderr } = runFailing([
    '--artifacts',
    artifacts,
    '--out',
    out,
    '--version',
    VERSION,
  ]);
  assert.equal(status, 1);
  assert.match(stderr, /missing release file\(s\): Mudrix_26\.12\.6_aarch64\.dmg/);
  assert.match(stderr, /files found:/);
});

test('an unsigned updater bundle fails instead of publishing a feed', () => {
  const files = stableFiles();
  delete files['mudrix-desktop-updater-macOS']['macos/Mudrix.app.tar.gz.sig'];
  const { artifacts, out } = fixture(files);
  const { status, stderr } = runFailing([
    '--artifacts',
    artifacts,
    '--out',
    out,
    '--version',
    VERSION,
  ]);
  assert.equal(status, 1);
  assert.match(stderr, /not signed/);
});

test('--dry-run writes nothing', () => {
  const { artifacts, out } = fixture(stableFiles());
  const stdout = run(['--artifacts', artifacts, '--out', out, '--version', VERSION, '--dry-run']);
  assert.match(stdout, /would ship Mudrix-26\.12\.6-release\.apk/);
  assert.equal(existsSync(out), false);
});
