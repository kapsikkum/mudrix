const URL_RE = /https?:\/\/[^\s<>"']+/gi;
const MATRIX_TO = 'https://matrix.to/';

export function extractFirstUrl(body?: string, formattedBody?: string): string | null {
  for (const src of [body, formattedBody]) {
    if (!src) continue;
    const matches = src.match(URL_RE);
    if (!matches) continue;
    for (const match of matches) {
      // Strip trailing punctuation that is commonly not part of the URL.
      const url = match.replace(/[.,!?;:)"'\]]+$/, '');
      if (url.startsWith(MATRIX_TO)) continue;
      try {
        new URL(url);
        return url;
      } catch {
        // not a valid URL, skip
      }
    }
  }
  return null;
}
