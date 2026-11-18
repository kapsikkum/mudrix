// Writes whatsnew/<version>.md, the notes the "What's new" dialog shows, from the commits since the
// previous release. Only user-facing commits make it in: `feat` goes under "New", `fix` and `perf`
// under "Fixed". Everything else (chore, refactor, docs, ci, ...) is left out.
//
// Commits that are clearly dev-only (CI, lint, refactors, ...) and trailing PR refs like "(#113)"
// are dropped automatically. A commit can steer its own line with a `Release-note:` trailer in the body:
//   Release-note: Spaces can now have roles.     -> use this wording instead of the subject
//   Release-note: skip                           -> leave it out
// Commits that are already made can be steered from scripts/release-notes.overrides.json, which maps
// a (short) commit hash to "skip" or to the replacement text. That file wins over the trailer.
//
// Usage: node scripts/release-notes.mjs <version> [--from <ref>] [--to <ref>] [--body <file>]
//   --from   previous release tag (default: the last tag before HEAD; stable releases skip pre-releases)
//   --to     end of the range (default: HEAD)
//   --body   also write the notes, as Markdown for a GitHub release body, to this file
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  return i === -1 ? undefined : args[i + 1];
};

const version = args[0]?.replace(/^v/, '');
if (!version || version.startsWith('--')) {
  console.error(
    'usage: node scripts/release-notes.mjs <version> [--from <ref>] [--to <ref>] [--body <file>]'
  );
  process.exit(1);
}
// The dialog reads whatsnew/<version>.md, where a pre-release keeps its suffix (26.11.0-next.2.md)
// so that every pre-release shows its notes once.
if (!/^\d+\.\d+\.\d+(-[0-9A-Za-z]+(\.[0-9A-Za-z]+)*)?$/.test(version)) {
  console.error(`"${version}" is not a version`);
  process.exit(1);
}

// Notes for commits that are already made: { "<short hash>": "skip" | "replacement text" }
const overridesFile = join(dirname(fileURLToPath(import.meta.url)), 'release-notes.overrides.json');
const overrides = existsSync(overridesFile) ? JSON.parse(readFileSync(overridesFile, 'utf8')) : {};
const overrideFor = (hash) => {
  const key = Object.keys(overrides).find((k) => k.length >= 7 && hash.startsWith(k));
  return key === undefined ? undefined : String(overrides[key]).trim();
};

const git = (...a) =>
  execFileSync('git', a, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).trim();

const to = flag('--to') ?? 'HEAD';
const preRelease = version.includes('-');
const from =
  flag('--from') ??
  git('tag', '--merged', to, '--list', 'v*', '--sort=-v:refname')
    .split('\n')
    .filter((tag) => tag && tag !== `v${version}`)
    .find((tag) => preRelease || !tag.includes('-'));

const range = from ? `${from}..${to}` : to;
const SEP = '\u001e';
// Oldest first, so a release reads in the order things happened.
const log = git('log', '--no-merges', '--reverse', `--format=%H %s%n%b${SEP}`, range)
  .split(SEP)
  .map((entry) => entry.trim())
  .filter(Boolean);

const TYPES = { feat: 'New', fix: 'Fixed', perf: 'Fixed' };
const SUBJECT = /^(\w+)(?:\(([^)]*)\))?(!)?:\s*(.+)$/;
// Scopes and wording that only matter to people working on the code
const DEV_SCOPES = /^(scripts?|ci|build|deps|test|tests|docs|dev|release)$/i;
const DEV_ONLY =
  /\b(refactor(ed|ing)?|lint(er|ing)?|eslint|prettier|typecheck|tsc|knip|vitest|tsconfig|ci|workflows?|github actions|dependabot|bumps?|bumped|changelog|release notes?|candidates?)\b/i;

// What a commit scope is called in the notes. Unlisted scopes are shown capitalised; commits without
// a scope go under "General".
const AREAS = {
  profile: 'Profiles',
  sounds: 'Sounds',
  rooms: 'Rooms',
  spaces: 'Spaces',
  voice: 'Voice',
  calls: 'Calls',
  mobile: 'Mobile',
  desktop: 'Desktop',
  settings: 'Settings',
  auth: 'Sign-in',
  login: 'Sign-in',
  activity: 'Activity',
  notifications: 'Notifications',
  composer: 'Composer',
  timeline: 'Messages',
  messages: 'Messages',
  i18n: 'Languages',
  a11y: 'Accessibility',
  ios: 'iOS',
  android: 'Android',
  ui: 'Interface',
  cosmetics: 'Cosmetics',
  nameplates: 'Interface',
};
const areaOf = (scope) => {
  if (!scope) return 'General';
  const key = scope.split(/[,/]/)[0].trim().toLowerCase();
  return AREAS[key] ?? key.replace(/^./, (c) => c.toUpperCase());
};

// section -> area -> notes, each in the order first seen (oldest first)
const sections = { New: new Map(), Fixed: new Map() };
for (const entry of log) {
  const [first, ...rest] = entry.split('\n');
  const [hash, ...subjectWords] = first.split(' ');
  const parsed = SUBJECT.exec(subjectWords.join(' '));
  if (!parsed) continue;
  const [, type, scope, , subjectText] = parsed;
  const section = TYPES[type];
  if (!section) continue;

  const override = overrideFor(hash);
  const trailer = /^Release-note:\s*(.+)$/im.exec(rest.join('\n'))?.[1].trim();
  const chosen = override || trailer;
  if (chosen?.toLowerCase() === 'skip') continue;
  if (!chosen && ((scope && DEV_SCOPES.test(scope)) || DEV_ONLY.test(subjectText))) continue;

  const text = chosen ?? subjectText.replace(/(\s*\(#\d+\))+\s*$/, '');
  const line = text.replace(/\s+/g, ' ').replace(/^./, (c) => c.toUpperCase());
  const note = /[.!?]$/.test(line) ? line : `${line}.`;
  const area = areaOf(scope);
  const notes = sections[section].get(area) ?? [];
  if (!notes.includes(note)) notes.push(note);
  sections[section].set(area, notes);
}

// A section with several areas gets a small heading per area; with one it is just a list.
const renderSection = (title, areas) => {
  const list = (notes) => notes.map((n) => `- ${n}`).join('\n');
  // An area with one note is not worth a heading of its own: those share "Other", at the end.
  const grouped = [...areas].filter(([, notes]) => notes.length > 1);
  const other = [...areas].filter(([, notes]) => notes.length === 1).flatMap(([, notes]) => notes);
  if (!grouped.length) return `## ${title}\n\n${list(other)}`;
  const parts = grouped.map(([area, notes]) => `### ${area}\n\n${list(notes)}`);
  if (other.length) parts.push(`### Other\n\n${list(other)}`);
  return `## ${title}\n\n${parts.join('\n\n')}`;
};
const markdown = Object.entries(sections)
  .filter(([, areas]) => areas.size)
  .map(([title, areas]) => renderSection(title, areas))
  .join('\n\n');

if (!markdown) {
  console.log(`No user-facing commits since ${from ?? 'the start'}; no notes written.`);
  process.exit(0);
}

const write = (file, content) => {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${content}\n`);
};
// The dialog shows the date; the file keeps it in front matter like the earlier notes did.
const today = new Date().toISOString().slice(0, 10);
write(`whatsnew/${version}.md`, `---\ndate: ${today}\n---\n\n${markdown}`);
const body = flag('--body');
if (body) write(body, markdown);
console.log(`Wrote whatsnew/${version}.md (${from ?? 'start'}..${to}):\n\n${markdown}`);
