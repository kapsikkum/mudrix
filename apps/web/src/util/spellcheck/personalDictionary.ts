import { STORAGE_KEY_SPELLCHECK_WORDS as STORAGE_KEY } from '@/const/storageKeys';

// Lower-cased: a word added as "Mudrix" also silences "mudrix" and "MUDRIX".
let words: Set<string> | null = null;
const ignored = new Set<string>();
const listeners = new Set<() => void>();

const keyOf = (word: string) => word.trim().toLowerCase();

function load(): Set<string> {
  if (words) return words;
  words = new Set();
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
    if (Array.isArray(raw)) {
      for (const w of raw) if (typeof w === 'string' && keyOf(w)) words.add(keyOf(w));
    }
  } catch {
    /* storage unavailable or corrupt: start empty */
  }
  return words;
}

function save(): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...load()]));
  } catch {
    /* storage unavailable or full: keep working in memory */
  }
}

function notify(): void {
  listeners.forEach((cb) => cb());
}

export function getPersonalWords(): string[] {
  return [...load()].sort((a, b) => a.localeCompare(b));
}

export function addPersonalWord(word: string): void {
  const key = keyOf(word);
  if (!key || load().has(key)) return;
  load().add(key);
  save();
  notify();
}

export function removePersonalWord(word: string): void {
  if (!load().delete(keyOf(word))) return;
  save();
  notify();
}

/** Ignores a word until the page is reloaded. */
export function ignoreWord(word: string): void {
  const key = keyOf(word);
  if (!key || ignored.has(key)) return;
  ignored.add(key);
  notify();
}

/** True when the word is in the personal dictionary or ignored for this session. */
export function isUserAccepted(word: string): boolean {
  const key = keyOf(word);
  return load().has(key) || ignored.has(key);
}

export function subscribePersonalWords(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

/** Drops the in-memory copy so the next access re-reads localStorage (tests, other tabs). */
export function reloadPersonalWords(): void {
  words = null;
  ignored.clear();
  notify();
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key !== STORAGE_KEY && e.key !== null) return;
    words = null;
    notify();
  });
}
