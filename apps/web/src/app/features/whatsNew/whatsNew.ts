const files = import.meta.glob('@whatsnew/*.md', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

const FILE_PATTERN = /\/(\d+\.\d+\.\d+)(?:\.([a-z]{2}))?\.md$/;
const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/;

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

const newestVersion = [...notes.keys()]
  .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
  .pop();

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
