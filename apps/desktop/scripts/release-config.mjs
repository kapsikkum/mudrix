#!/usr/bin/env node
// Prepares a release build in CI: checks that the run is for the version tag and puts the updater's
// public key into tauri.release.conf.json, so the app can verify the updates it downloads. See
// docs/BUILDING.md.
//
//   node apps/desktop/scripts/release-config.mjs --profile=release
//
// GitHub Actions sets GITHUB_REF_TYPE=tag and GITHUB_REF_NAME=v<version> for a run started from a
// tag. A release profile anywhere else (a branch dispatch, a pull request) fails before anything is
// built. The key comes from TAURI_UPDATER_PUBKEY when it is set, else from plugins.updater.pubkey
// already committed in tauri.conf.json.
import { readFileSync, writeFileSync } from 'node:fs';

const root = new URL('../../../', import.meta.url);
const configUrl = new URL('apps/desktop/src-tauri/tauri.release.conf.json', root);
const baseConfigUrl = new URL('apps/desktop/src-tauri/tauri.conf.json', root);
const { version } = JSON.parse(readFileSync(new URL('package.json', root), 'utf8'));
const {
  GITHUB_REF_TYPE: refType,
  GITHUB_REF_NAME: refName,
  TAURI_UPDATER_PUBKEY: envPubkey,
} = process.env;

const profileArg = process.argv.slice(2).find((arg) => arg.startsWith('--profile='));
const profile = profileArg ? profileArg.slice('--profile='.length) : 'release';

if (profile !== 'release' && profile !== 'debug') {
  throw new Error(`Unknown profile "${profile}": use --profile=release or --profile=debug`);
}

if (profile !== 'release') {
  console.log(`profile=${profile}: no release config written`);
  process.exit(0);
}

const tag = `v${version}`;
if (refType !== 'tag' || refName !== tag) {
  const actual =
    refType && refName
      ? `this run is for ${refType} ${refName}`
      : 'GITHUB_REF_TYPE/GITHUB_REF_NAME are not set';
  throw new Error(
    `A release build must run on the version tag ${tag} (package.json): ${actual}. ` +
      `Dispatch the workflow with --ref ${tag} and profile=release.`
  );
}

const baseConfig = JSON.parse(readFileSync(baseConfigUrl, 'utf8'));
const pubkey = (envPubkey ?? '').trim() || baseConfig.plugins?.updater?.pubkey;
if (!pubkey) {
  throw new Error(
    'No updater public key: set TAURI_UPDATER_PUBKEY or plugins.updater.pubkey in tauri.conf.json'
  );
}

const config = JSON.parse(readFileSync(configUrl, 'utf8'));
config.plugins = { ...config.plugins, updater: { ...config.plugins?.updater, pubkey } };
writeFileSync(configUrl, `${JSON.stringify(config, null, 2)}\n`);
console.log(`release build of ${tag} with the updater key`);
