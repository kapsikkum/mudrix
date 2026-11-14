export type WordToken = { word: string; start: number; end: number };

// Letters (any script, incl. combining marks), digits and underscore make up a chunk; an
// apostrophe only joins two chunks ("don't"). Hyphens split words, so each part is checked alone.
const CHUNK = /[\p{L}\p{M}\p{N}_]+(?:['’][\p{L}\p{M}\p{N}_]+)*/gu;
const SEGMENT = /\S+/gu;
const RUN_CHAR = /[\p{L}\p{M}\p{N}_'’-]/u;
const HAS_DIGIT_OR_UNDERSCORE = /[\p{N}_]/u;
const CAMEL_CASE = /\p{Ll}\p{Lu}/u;
const SKIP_PREFIX = new Set(['@', '#', ':', '/', '\\']);

const LEADING_PUNCT = /^[([{<"'‘“]+/;
const TRAILING_PUNCT = /[.,;:!?)\]}>"'’”]+$/;
const URL_SCHEME = /^[a-z][a-z0-9+.-]*:\/\//i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// host.tld with an all-lowercase tail (file.txt, example.com/path), so "end.Start" still gets checked
const DOMAIN = /^[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)*\.[a-z]{2,}(?:[/?#:].*)?$/u;

/** True for whitespace-delimited segments that are links, addresses, ids or file names. */
function isOpaqueSegment(segment: string): boolean {
  const s = segment.replace(LEADING_PUNCT, '');
  if (s.startsWith('@') || s.startsWith('#')) return true;
  const t = s.replace(TRAILING_PUNCT, '');
  return URL_SCHEME.test(t) || /^www\./i.test(t) || EMAIL.test(t) || DOMAIN.test(t);
}

/** The character before the hyphen/apostrophe-joined run that starts at `start`. */
function charBeforeRun(text: string, start: number): string {
  let i = start;
  while (i > 0 && RUN_CHAR.test(text[i - 1])) i--;
  return i > 0 ? text[i - 1] : '';
}

function isCheckable(word: string): boolean {
  if (HAS_DIGIT_OR_UNDERSCORE.test(word)) return false;
  if ([...word].length < 2) return false;
  // acronyms: NASA, USB, API
  if (word.length <= 4 && word === word.toUpperCase() && word !== word.toLowerCase()) return false;
  // identifiers: matrixClient, iPhone
  if (CAMEL_CASE.test(word)) return false;
  return true;
}

/** Finds the words worth spell checking, with their [start, end) offsets in `text`. */
export function tokenizeWords(text: string): WordToken[] {
  const out: WordToken[] = [];
  for (const seg of text.matchAll(SEGMENT)) {
    if (isOpaqueSegment(seg[0])) continue;
    for (const m of seg[0].matchAll(CHUNK)) {
      const start = seg.index + m.index;
      if (!isCheckable(m[0])) continue;
      if (SKIP_PREFIX.has(charBeforeRun(text, start))) continue;
      out.push({ word: m[0], start, end: start + m[0].length });
    }
  }
  return out;
}
