#!/usr/bin/env node
// Materialises the Android release signing config for Gradle, and verifies a signed APK.
//
// Secrets never go in the repository: in CI they come from repository secrets, locally from your
// environment or from the files you point at. Both paths end in the git-ignored
// apps/android/keystore.properties (and a copy of the keystore beside it), which is what
// apps/android/app/build.gradle.kts reads.
//
//   ANDROID_KEYSTORE_BASE64        base64 of the .jks/.keystore (CI)
//   ANDROID_KEYSTORE_PATH          path to the keystore (local)
//   ANDROID_KEYSTORE_PASSWORD      store password
//   ANDROID_KEY_ALIAS              key alias
//   ANDROID_KEY_PASSWORD           key password (defaults to the store password)
//
// Usage:
//   node tools/ci/sign-android.mjs prepare [--optional]
//   node tools/ci/sign-android.mjs verify <apk>
//   node tools/ci/sign-android.mjs clean
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = path.resolve(import.meta.dirname, '../..');
const android = path.join(root, 'apps/android');
const keystoreCopy = path.join(android, 'release.keystore');
const propertiesFile = path.join(android, 'keystore.properties');

function fail(message) {
  console.error(`sign-android: ${message}`);
  process.exit(1);
}

function env(name) {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

/** Writes the Gradle config; the keystore always lands beside it, so the path needs no escaping. */
function prepare(optional) {
  const base64 = env('ANDROID_KEYSTORE_BASE64');
  const source = env('ANDROID_KEYSTORE_PATH');
  const storePassword = env('ANDROID_KEYSTORE_PASSWORD');
  const alias = env('ANDROID_KEY_ALIAS');
  const keyPassword = env('ANDROID_KEY_PASSWORD') ?? storePassword;

  if (!base64 && !source) {
    if (optional) {
      console.log('sign-android: no keystore configured; the build stays debug-signed');
      return;
    }
    fail('set ANDROID_KEYSTORE_BASE64 (CI) or ANDROID_KEYSTORE_PATH (local)');
  }
  if (!storePassword) fail('set ANDROID_KEYSTORE_PASSWORD');
  if (!alias) fail('set ANDROID_KEY_ALIAS');
  if (!keyPassword) fail('set ANDROID_KEY_PASSWORD');

  if (base64) {
    fs.writeFileSync(keystoreCopy, Buffer.from(base64, 'base64'), { mode: 0o600 });
  } else {
    if (!fs.existsSync(source)) fail(`keystore not found: ${source}`);
    fs.copyFileSync(source, keystoreCopy);
  }

  fs.writeFileSync(
    propertiesFile,
    [
      'storeFile=release.keystore',
      `storePassword=${storePassword}`,
      `keyAlias=${alias}`,
      `keyPassword=${keyPassword}`,
      '',
    ].join('\n'),
    { mode: 0o600 }
  );
  console.log(`sign-android: signing configured (alias ${alias})`);
}

/** Finds apksigner in the Android SDK, newest build-tools first, or on PATH. */
function findApksigner() {
  if (env('APKSIGNER')) return env('APKSIGNER');
  const sdk = env('ANDROID_HOME') ?? env('ANDROID_SDK_ROOT');
  if (sdk) {
    const buildTools = path.join(sdk, 'build-tools');
    if (fs.existsSync(buildTools)) {
      const versions = fs
        .readdirSync(buildTools)
        .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
        .reverse();
      for (const version of versions) {
        const candidate = path.join(
          buildTools,
          version,
          process.platform === 'win32' ? 'apksigner.bat' : 'apksigner'
        );
        if (fs.existsSync(candidate)) return candidate;
      }
    }
  }
  return process.platform === 'win32' ? 'apksigner.bat' : 'apksigner';
}

/** Verifies the APK signature and prints the signer certificate, which is not a secret. */
function verify(apk) {
  if (!apk || !fs.existsSync(apk)) fail(`APK not found: ${apk}`);
  const signer = findApksigner();
  const args = ['verify', '--verbose', '--print-certs', apk];
  // A .bat cannot be spawned directly on Windows; cmd /c runs it without shell quoting surprises.
  const result =
    process.platform === 'win32' && /\.bat$/i.test(signer)
      ? spawnSync(process.env.ComSpec ?? 'cmd.exe', ['/d', '/s', '/c', signer, ...args], {
          stdio: ['ignore', 'pipe', 'pipe'],
          encoding: 'utf8',
        })
      : spawnSync(signer, args, { stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8' });
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
  const interesting = output
    .split(/\r?\n/)
    .filter((line) => /Verified using|Signer #1 certificate (DN|SHA-256)/i.test(line))
    .map((line) => line.trim());
  console.log(interesting.join('\n') || output.trim());
  if (result.error) fail(result.error.message);
  if (result.status !== 0) fail(`apksigner rejected ${apk}`);
}

function clean() {
  for (const file of [keystoreCopy, propertiesFile]) {
    fs.rmSync(file, { force: true });
  }
  console.log('sign-android: removed the local signing files');
}

const [command = 'prepare', ...args] = process.argv.slice(2);
if (command === 'prepare') prepare(args.includes('--optional'));
else if (command === 'verify') verify(args[0]);
else if (command === 'clean') clean();
else fail(`unknown command: ${command}`);
