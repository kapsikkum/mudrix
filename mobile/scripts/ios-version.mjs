import { readFileSync, writeFileSync } from 'node:fs';

const version = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url))).version;
const m = /^(\d+)\.(\d+)\.(\d+)(?:-[a-z]+\.(\d+))?$/.exec(version);
if (!m) throw new Error(`Unsupported version: ${version}`);
const [major, minor, patch] = m.slice(1, 4).map(Number);
const build = major * 1000000 + minor * 10000 + patch * 100 + (m[4] === undefined ? 99 : Number(m[4]));

const project = new URL('../ios/App/App.xcodeproj/project.pbxproj', import.meta.url);
const updated = readFileSync(project, 'utf8')
  .replace(/MARKETING_VERSION = [^;]+;/g, `MARKETING_VERSION = ${major}.${minor}.${patch};`)
  .replace(/CURRENT_PROJECT_VERSION = [^;]+;/g, `CURRENT_PROJECT_VERSION = ${build};`);
writeFileSync(project, updated);
console.log(`iOS version ${major}.${minor}.${patch} (${build})`);
