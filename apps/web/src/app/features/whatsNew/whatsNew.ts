const files = import.meta.glob('@whatsnew/*.md', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

// <version>[.<lang>].md; a pre-release keeps its suffix: 26.11.0-next.2.md, 26.11.0-next.2.de.md
const FILE_PATTERN =
  /\/(\d+\.\d+\.\d+(?:-[0-9A-Za-z]+(?:\.[0-9A-Za-z]+)*?)?)(?:\.([a-z]{2}))?\.md$/;

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/;

/** Oldest first: base numbers, then a pre-release before its stable release (-next.2 < -next.10 < stable). */
export function compareVersions(a: string, b: string): number {
  const [baseA, preA] = a.split(/-(.*)/s);
  const [baseB, preB] = b.split(/-(.*)/s);
  const byBase = baseA.localeCompare(baseB, undefined, { numeric: true });
  if (byBase !== 0) return byBase;
  if (!preA || !preB) {
    if (preA) return -1;
    return preB ? 1 : 0;
  }
  const idsA = preA.split('.');
  const idsB = preB.split('.');
  for (let i = 0; i < Math.max(idsA.length, idsB.length); i += 1) {
    const x = idsA[i];
    const y = idsB[i];
    if (x === undefined) return -1;
    if (y === undefined) return 1;
    const numeric = /^\d+$/.test(x) && /^\d+$/.test(y);
    const diff = numeric ? Number(x) - Number(y) : x.localeCompare(y);
    if (diff !== 0) return diff;
  }
  return 0;
}

export interface WhatsNewEntry {
  version: string;
  markdown: string;
  date?: string;
}

interface Note {
  meta: Record<string, string>;
  markdown: string;
}

function parseNote(content: string): Note {
  const match = FRONTMATTER.exec(content);
  if (!match) return { meta: {}, markdown: content };
  const meta: Record<string, string> = {};
  for (const line of match[1].split(/\r?\n/)) {
    const colon = line.indexOf(':');
    if (colon <= 0) continue;
    const value = line
      .slice(colon + 1)
      .trim()
      .replace(/^(["'])(.*)\1$/, '$2');
    if (value) meta[line.slice(0, colon).trim()] = value;
  }
  return { meta, markdown: content.slice(match[0].length).trim() };
}

const notes = new Map<string, Map<string, Note>>();
for (const [path, content] of Object.entries(files)) {
  const match = FILE_PATTERN.exec(path);
  if (!match || !content.trim()) continue;
  const [, version, lang = ''] = match;
  if (!notes.has(version)) notes.set(version, new Map());
  notes.get(version)!.set(lang, parseNote(content.trim()));
}

const newestVersion = [...notes.keys()].sort(compareVersions).pop();

export function latestWhatsNew(language: string): WhatsNewEntry | null {
  if (!newestVersion) return null;
  const byLang = notes.get(newestVersion)!;
  const fallback = byLang.get('');
  const note = byLang.get(language.slice(0, 2)) ?? fallback;
  if (!note?.markdown) return null;
  return {
    version: newestVersion,
    markdown: note.markdown,
    date: note.meta.date ?? fallback?.meta.date,
  };
}
