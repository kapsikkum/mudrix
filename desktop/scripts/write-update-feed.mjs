#!/usr/bin/env node
// Puts the desktop update files into the web build, so they go live with the web deploy of the
// same track: app.wizardchat.org/desktop/ (stable) or next.wizardchat.org/desktop/ (next).
//
// electron-builder writes latest.yml / latest-mac.yml / latest-linux.yml with bare file names;
// the installers live in the GitLab package registry, so those become absolute download URLs.
//
// Usage: node desktop/scripts/write-update-feed.mjs <release dir> <web dist dir>
// Env: CI_COMMIT_TAG, CI_SERVER_HOST, CI_PROJECT_ID

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const [releaseDir, distDir] = process.argv.slice(2);
const { CI_COMMIT_TAG: tag, CI_SERVER_HOST: host, CI_PROJECT_ID: projectId } = process.env;
if (!releaseDir || !distDir || !tag || !host || !projectId) {
  throw new Error('usage: write-update-feed.mjs <release dir> <dist dir> (needs CI_COMMIT_TAG, CI_SERVER_HOST, CI_PROJECT_ID)');
}

const downloadBase = `https://${host}/api/v4/projects/${projectId}/packages/generic/wizardchat-desktop/${tag}/`;
const outDir = path.join(distDir, 'desktop');
await mkdir(outDir, { recursive: true });

for (const name of ['latest.yml', 'latest-mac.yml', 'latest-linux.yml']) {
  const yml = await readFile(path.join(releaseDir, name), 'utf8');
  // `url:` and `path:` entries: file name → registry download URL
  const absolute = yml.replace(
    /^(\s*(?:-\s+)?(?:url|path):\s*)(['"]?)([^'"\n]+)\2\s*$/gm,
    (line, key, _quote, value) =>
      /^https?:\/\//.test(value) ? line : `${key}${downloadBase}${encodeURIComponent(value.trim())}`
  );
  await writeFile(path.join(outDir, name), absolute);
  console.log(`${name}: ${/^version:\s*(\S+)/m.exec(absolute)?.[1]}`);
}
