import { publicUrl } from '../publicUrl';
import { isSpellcheckAvailable, isSpellcheckLanguage } from './languages';
import { isUserAccepted } from './personalDictionary';
import type { WorkerRequest, WorkerResponse } from './spellcheck.worker';

export { SPELLCHECK_LANGUAGES, dictionaryForLocale, isSpellcheckAvailable } from './languages';
export type { SpellcheckLanguage } from './languages';
export {
  getPersonalWords,
  addPersonalWord,
  removePersonalWord,
  subscribePersonalWords,
  ignoreWord,
} from './personalDictionary';
export { tokenizeWords } from './tokenize';
export type { WordToken } from './tokenize';

const MAX_SUGGESTIONS = 6;
const RETRY_FAILED_LOAD_MS = 30_000;
// Parsing is the slow part (French ~6s, Polish ~18s on a desktop); a dictionary that takes longer
// than this is given up on for the session and its worker is killed to free the memory.
const LOAD_TIMEOUT_MS = 120_000;
const MAX_CACHE = 20_000;

// Parsing a dictionary and every Hunspell lookup happen in module workers so typing never stalls.
// One worker per language: a slow or crashing dictionary cannot block or take down the others.
const workers = new Map<string, Worker>();
const pending = new Map<number, { lang: string; resolve: (res: WorkerResponse | null) => void }>();
const loads = new Map<string, Promise<boolean>>();
const gaveUp = new Set<string>();
let nextId = 1;

/** Kills a language's worker and resolves everything waiting on it with null. */
function dropWorker(lang: string, permanent: boolean) {
  workers.get(lang)?.terminate();
  workers.delete(lang);
  if (permanent) gaveUp.add(lang);
  else {
    // back off, and meanwhile treat the language as absent (a fresh worker would not have it loaded)
    loads.set(lang, Promise.resolve(false));
    setTimeout(() => loads.delete(lang), RETRY_FAILED_LOAD_MS);
  }
  for (const [id, p] of pending) {
    if (p.lang !== lang) continue;
    pending.delete(id);
    p.resolve(null);
  }
}

function getWorker(lang: string): Worker | null {
  const existing = workers.get(lang);
  if (existing) return existing;
  if (typeof Worker === 'undefined') return null;
  try {
    const w = new Worker(new URL('./spellcheck.worker.ts', import.meta.url), { type: 'module' });
    w.onmessage = (e: MessageEvent<WorkerResponse>) => {
      pending.get(e.data.id)?.resolve(e.data);
      pending.delete(e.data.id);
    };
    w.onerror = () => dropWorker(lang, false);
    workers.set(lang, w);
    return w;
  } catch {
    return null;
  }
}

type Distribute<T> = T extends unknown ? Omit<T, 'id'> : never;

/** Resolves null when the worker is unavailable or dies; never rejects. */
function request(msg: Distribute<WorkerRequest>): Promise<WorkerResponse | null> {
  const w = getWorker(msg.lang);
  if (!w) return Promise.resolve(null);
  return new Promise((resolve) => {
    const id = nextId++;
    pending.set(id, { lang: msg.lang, resolve });
    try {
      w.postMessage({ ...msg, id });
    } catch {
      pending.delete(id);
      resolve(null);
    }
  });
}

/** Fetches and parses a dictionary once; resolves true when it is ready to use. */
function ensureLoaded(lang: string): Promise<boolean> {
  let p = loads.get(lang);
  if (!p) {
    if (gaveUp.has(lang) || !isSpellcheckAvailable(lang)) return Promise.resolve(false);
    const timer = setTimeout(() => dropWorker(lang, true), LOAD_TIMEOUT_MS);
    p = request({
      op: 'load',
      lang,
      affUrl: publicUrl(`dictionaries/${lang}/index.aff`),
      dicUrl: publicUrl(`dictionaries/${lang}/index.dic`),
    }).then((res) => {
      clearTimeout(timer);
      const ok = !!res && 'ok' in res && res.ok;
      if (!ok && !gaveUp.has(lang)) dropWorker(lang, false);
      return ok;
    });
    loads.set(lang, p);
  }
  return p;
}

async function usableLanguages(languages: string[]): Promise<string[]> {
  const wanted = [...new Set(languages.filter(isSpellcheckLanguage))];
  const ready = await Promise.all(wanted.map(ensureLoaded));
  return wanted.filter((_, i) => ready[i]);
}

// Dictionary verdicts only (true = misspelled), keyed by language + word. The personal
// dictionary and ignore list are applied on top, so editing them needs no cache flush.
const cache = new Map<string, boolean>();
const cacheKey = (lang: string, word: string) => `${lang}\u0000${word}`;

async function misspelledIn(lang: string, words: string[]): Promise<Set<string>> {
  const bad = new Set<string>();
  const unknown: string[] = [];
  for (const w of words) {
    const hit = cache.get(cacheKey(lang, w));
    if (hit === undefined) unknown.push(w);
    else if (hit) bad.add(w);
  }
  if (unknown.length) {
    const res = await request({ op: 'check', lang, words: unknown });
    // a dead worker is not cached: those words stay "correct" until it recovers
    if (res && 'misspelled' in res) {
      if (cache.size > MAX_CACHE) cache.clear();
      const misspelled = new Set(res.misspelled);
      for (const w of unknown) {
        const isBad = misspelled.has(w);
        cache.set(cacheKey(lang, w), isBad);
        if (isBad) bad.add(w);
      }
    }
  }
  return bad;
}

/**
 * Returns the words that are misspelled in ALL of the given languages. Languages are loaded on
 * first use (resolves once ready); unknown or unloadable ones are ignored, so with no usable
 * language everything counts as correct. Never throws.
 */
export async function checkWords(words: string[], languages: string[]): Promise<Set<string>> {
  try {
    const candidates = [...new Set(words)].filter((w) => !isUserAccepted(w));
    if (!candidates.length) return new Set();
    const langs = await usableLanguages(languages);
    if (!langs.length) return new Set();
    const perLang = await Promise.all(langs.map((l) => misspelledIn(l, candidates)));
    return new Set(candidates.filter((w) => perLang.every((bad) => bad.has(w))));
  } catch {
    return new Set();
  }
}

/** Gives a suggestion the capitalisation style of the original word. */
function matchCase(word: string, suggestion: string): string {
  const letters = word.replace(/[^\p{L}]/gu, '');
  if (letters.length > 1 && letters === letters.toUpperCase()) return suggestion.toUpperCase();
  const first = word.charAt(0);
  if (
    first !== first.toLowerCase() &&
    suggestion.charAt(0) === suggestion.charAt(0).toLowerCase()
  ) {
    return suggestion.charAt(0).toUpperCase() + suggestion.slice(1);
  }
  return suggestion;
}

/**
 * Up to 6 suggestions, taken round-robin from each language (first language first), de-duplicated
 * and capitalised like the input. Resolves [] on any failure.
 */
export async function suggestWords(word: string, languages: string[]): Promise<string[]> {
  try {
    const langs = await usableLanguages(languages);
    const lists = await Promise.all(
      langs.map(async (lang) => {
        const res = await request({ op: 'suggest', lang, word });
        return res && 'suggestions' in res ? res.suggestions : [];
      })
    );
    const out: string[] = [];
    const seen = new Set<string>();
    for (let i = 0; out.length < MAX_SUGGESTIONS; i++) {
      let any = false;
      for (const list of lists) {
        if (i >= list.length) continue;
        any = true;
        const s = matchCase(word, list[i]);
        if (seen.has(s) || s === word) continue;
        seen.add(s);
        if (out.length < MAX_SUGGESTIONS) out.push(s);
      }
      if (!any) break;
    }
    return out;
  } catch {
    return [];
  }
}
