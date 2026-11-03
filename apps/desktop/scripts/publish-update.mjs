// Publishes a desktop release from the CI build artifacts: uploads the installers and update bundles
// to the GitLab package registry (`wizardchat-desktop/<tag>/`) and writes the update feed the apps
// check (`wizardchat-desktop/<channel>/latest.json`), stable releases to stable and next releases to
// next. The installers are listed in desktop-assets.json for the release page.
// The Linux tarball's PKGBUILD goes next to the feed (`<channel>/PKGBUILD`) for Arch users.
// See docs/BUILDING.md.
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';

const {
  CI_API_V4_URL: api,
  CI_PROJECT_ID: project,
  CI_JOB_TOKEN: token,
  CI_COMMIT_TAG: tag,
  DRY_RUN: dryRun,
} = process.env;
if (!api || !project || !token || !tag) throw new Error('run this in a CI tag pipeline');

const version = tag.replace(/^v/, '');
const bundle = 'target/release/bundle';
const registry = `${api}/projects/${project}/packages/generic/wizardchat-desktop`;

function find(dir, suffix) {
  const path = join(bundle, dir);
  const file = existsSync(path) && readdirSync(path).find((name) => name.endsWith(suffix));
  if (!file) throw new Error(`no ${suffix} in ${path}`);
  return join(path, file);
}

async function upload(file, folder = tag, name = basename(file)) {
  const url = `${registry}/${folder}/${encodeURIComponent(name)}`;
  if (dryRun === 'true') {
    console.log(`DRY RUN: would upload ${folder}/${name}`);
    return url;
  }
  const response = await fetch(url, {
    method: 'PUT',
    headers: { 'JOB-TOKEN': token },
    body: readFileSync(file),
  });
  if (!response.ok)
    throw new Error(`uploading ${name}: ${response.status} ${await response.text()}`);
  console.log(`uploaded ${folder}/${name}`);
  return url;
}

// Each platform's update bundle with the signature the build wrote next to it
const updates = {
  'darwin-aarch64': find('macos', '.app.tar.gz'),
  'linux-x86_64': find('appimage', '.AppImage'),
  'linux-x86_64-deb': find('deb', '.deb'),
  'linux-x86_64-rpm': find('rpm', '.rpm'),
  'windows-x86_64': find('nsis', '-setup.exe'),
};
const installers = [find('dmg', '.dmg'), find('tarball', '.tar.gz'), find('arch', '.pkg.tar.zst')];

const platforms = {};
for (const [platform, file] of Object.entries(updates)) {
  platforms[platform] = {
    url: await upload(file),
    signature: readFileSync(`${file}.sig`, 'utf8').trim(),
  };
  await upload(`${file}.sig`);
}
for (const file of installers) await upload(file);
const downloads = [
  ...installers,
  updates['windows-x86_64'],
  updates['linux-x86_64'],
  updates['linux-x86_64-deb'],
  updates['linux-x86_64-rpm'],
];
const assets = downloads.map((file) => ({
  name: basename(file),
  url: `${registry}/${tag}/${encodeURIComponent(basename(file))}`,
  link_type: 'package',
}));
writeFileSync('desktop-assets.json', JSON.stringify(assets));

const notesFile = `whatsnew/${version.replace(/-.*$/, '')}.md`;
const feed = JSON.stringify({
  version,
  notes: existsSync(notesFile) ? readFileSync(notesFile, 'utf8') : '',
  pub_date: new Date().toISOString(),
  platforms,
});
const feedFile = join(bundle, 'latest.json');
writeFileSync(feedFile, feed);
const channel = version.includes('-next') ? 'next' : 'stable';
await upload(feedFile, channel, 'latest.json');

const pkgbuildFile = join(bundle, 'tarball/PKGBUILD');
await upload(pkgbuildFile);
await upload(pkgbuildFile, channel, 'PKGBUILD');
