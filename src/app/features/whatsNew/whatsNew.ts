const files = import.meta.glob('/whatsnew/*.md', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

const FILE_PATTERN = /\/(\d+\.\d+\.\d+)(?:\.([a-z]{2}))?\.md$/;

export interface WhatsNewEntry {
  version: string;
  markdown: string;
}

const notes = new Map<string, Map<string, string>>();
for (const [path, content] of Object.entries(files)) {
  const match = FILE_PATTERN.exec(path);
  if (!match || !content.trim()) continue;
  const [, version, lang = ''] = match;
  if (!notes.has(version)) notes.set(version, new Map());
  notes.get(version)!.set(lang, content.trim());
}

const newestVersion = [...notes.keys()]
  .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
  .pop();

export function latestWhatsNew(language: string): WhatsNewEntry | null {
  if (!newestVersion) return null;
  const byLang = notes.get(newestVersion)!;
  const markdown = byLang.get(language.slice(0, 2)) ?? byLang.get('');
  return markdown ? { version: newestVersion, markdown } : null;
}
