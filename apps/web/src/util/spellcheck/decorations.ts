import { tokenizeWords, type WordToken } from './tokenize';

/** The distinct checkable words of several texts, in first-seen order. */
export function uniqueWords(texts: string[]): string[] {
  const seen = new Set<string>();
  for (const text of texts) {
    for (const token of tokenizeWords(text)) seen.add(token.word);
  }
  return [...seen];
}

/**
 * The words of `text` to underline. The word the caret is in or at the end of (`caret` is an offset
 * in `text`, null when the caret is elsewhere) is left out until the caret leaves it, so a word is
 * not flagged half typed.
 */
export function misspelledTokens(
  text: string,
  misspelled: ReadonlySet<string>,
  caret: number | null
): WordToken[] {
  if (misspelled.size === 0) return [];
  return tokenizeWords(text).filter(
    (token) =>
      misspelled.has(token.word) && !(caret !== null && caret >= token.start && caret <= token.end)
  );
}

/** The checkable word at `offset` (touching either edge counts), or null. */
export function wordAtOffset(text: string, offset: number): WordToken | null {
  return tokenizeWords(text).find((t) => offset >= t.start && offset <= t.end) ?? null;
}

export function sameWords(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
  if (a.size !== b.size) return false;
  for (const w of a) if (!b.has(w)) return false;
  return true;
}
