import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  SPELLCHECK_LANGUAGES,
  dictionaryForLocale,
  isSpellcheckAvailable,
} from '../src/util/spellcheck/languages.ts';
import { tokenizeWords } from '../src/util/spellcheck/tokenize.ts';
import {
  misspelledTokens,
  sameWords,
  uniqueWords,
  wordAtOffset,
} from '../src/util/spellcheck/decorations.ts';
import {
  addPersonalWord,
  getPersonalWords,
  ignoreWord,
  isUserAccepted,
  reloadPersonalWords,
  removePersonalWord,
  subscribePersonalWords,
} from '../src/util/spellcheck/personalDictionary.ts';

const words = (text: string) => tokenizeWords(text).map((t) => t.word);

test('words, offsets and apostrophes are found', () => {
  assert.deepEqual(words('Hello brave world'), ['Hello', 'brave', 'world']);
  assert.deepEqual(tokenizeWords('a  teh'), [{ word: 'teh', start: 3, end: 6 }]);
  assert.deepEqual(
    tokenizeWords('x \u00e9t\u00e9 ok').map((t) => [t.start, t.end]),
    [
      [2, 5],
      [6, 8],
    ]
  );
  assert.deepEqual(words('caf\u00e9 na\u00efve \u00fcber'), [
    'caf\u00e9',
    'na\u00efve',
    '\u00fcber',
  ]);
  assert.deepEqual(words('\u043f\u0440\u0438\u0432\u0435\u0442 \u043c\u0438\u0440'), [
    '\u043f\u0440\u0438\u0432\u0435\u0442',
    '\u043c\u0438\u0440',
  ]);
  assert.deepEqual(words("don't stop"), ["don't", 'stop']);
  assert.deepEqual(words('don\u2019t stop'), ['don\u2019t', 'stop']);
  assert.deepEqual(words("'hello' there"), ['hello', 'there']);
  assert.deepEqual(words("the dogs' bowl"), ['the', 'dogs', 'bowl']);
});

test('hyphens split words and numbers are left alone', () => {
  assert.deepEqual(tokenizeWords('well-known fact'), [
    { word: 'well', start: 0, end: 4 },
    { word: 'known', start: 5, end: 10 },
    { word: 'fact', start: 11, end: 15 },
  ]);
  assert.deepEqual(words('abc123 4chan 2024 fine'), ['fine']);
  assert.deepEqual(words('abc-123 foo2-bar'), ['abc', 'bar']);
  assert.deepEqual(words('snake_case_name word'), ['word']);
  assert.deepEqual(words('a b c word'), ['word']);
});

test('acronyms and identifiers are not checked', () => {
  assert.deepEqual(words('NASA USB API HTTP CPU'), []);
  assert.deepEqual(words('HELLO WORLD'), ['HELLO', 'WORLD']);
  assert.deepEqual(words('matrixClient iPhone plain'), ['plain']);
});

test('links, addresses, mentions and paths are skipped', () => {
  assert.deepEqual(words('see https://example.com/some/path?q=1 now'), ['see', 'now']);
  assert.deepEqual(words('(https://example.com/abc) ok'), ['ok']);
  assert.deepEqual(words('visit www.example.com today'), ['visit', 'today']);
  assert.deepEqual(words('open example.com or file.txt please'), ['open', 'or', 'please']);
  assert.deepEqual(words('mail me@example.org please'), ['mail', 'please']);
  assert.deepEqual(words('hi @alice and @bob:matrix.org'), ['hi', 'and']);
  assert.deepEqual(words('hi @some-user ok'), ['hi', 'ok']);
  assert.deepEqual(words('join #general:example.org now'), ['join', 'now']);
  assert.deepEqual(words('lol :smile: ok'), ['lol', 'ok']);
  assert.deepEqual(words('cd /usr/local/bin now'), ['cd', 'now']);
  assert.deepEqual(words('C:\\Users\\kapsi done'), ['done']);
  assert.deepEqual(words('End.Start again'), ['End', 'Start', 'again']);
  assert.deepEqual(words(''), []);
  assert.deepEqual(words('... !!! ???'), []);
});

test('the language list matches the bundled dictionaries', () => {
  assert.deepEqual(
    SPELLCHECK_LANGUAGES.map((l) => l.code),
    ['en', 'de', 'es', 'fr', 'it', 'nl', 'pl', 'pt', 'ru', 'tr']
  );
  assert.deepEqual(
    SPELLCHECK_LANGUAGES.filter((l) => !l.available).map((l) => l.code),
    []
  );
});

test('app locales map to dictionaries', () => {
  assert.equal(dictionaryForLocale('en'), 'en');
  assert.equal(dictionaryForLocale('en-US'), 'en');
  assert.equal(dictionaryForLocale('pt-BR'), 'pt');
  assert.equal(dictionaryForLocale('de_AT'), 'de');
  assert.equal(dictionaryForLocale('ru'), 'ru');
  assert.equal(dictionaryForLocale('tr'), 'tr');
  assert.equal(dictionaryForLocale('ja'), null);
  assert.equal(dictionaryForLocale('ja-JP'), null);
  assert.equal(dictionaryForLocale('xx'), null);
  assert.equal(dictionaryForLocale(''), null);
  assert.equal(isSpellcheckAvailable('en'), true);
  assert.equal(isSpellcheckAvailable('ja'), false);
});

test('underline spans skip the word being typed', () => {
  const bad = new Set(['teh', 'wrold']);
  const spans = (text: string, caret: number | null) =>
    misspelledTokens(text, bad, caret).map((t) => [t.start, t.end]);

  assert.deepEqual(spans('teh good wrold', null), [
    [0, 3],
    [9, 14],
  ]);
  assert.deepEqual(misspelledTokens('teh', new Set(), null), []);
  assert.deepEqual(spans('teh good wrold', 14), [[0, 3]]);
  assert.deepEqual(spans('teh good wrold', 11), [[0, 3]]);
  assert.deepEqual(spans('teh good wrold', 9), [[0, 3]]);
  assert.deepEqual(spans('teh good wrold', 4), [
    [0, 3],
    [9, 14],
  ]);
  assert.deepEqual(spans('teh ', 4), [[0, 3]]);
  assert.deepEqual(spans('@teh https://teh.com/x teh', null), [[23, 26]]);
  assert.deepEqual(spans('the world', null), []);
});

test('the word under the pointer is found', () => {
  assert.equal(wordAtOffset('hello brave', 7)?.word, 'brave');
  assert.equal(wordAtOffset('hello brave', 6)?.word, 'brave');
  assert.equal(wordAtOffset('hello brave', 5)?.word, 'hello');
  assert.equal(wordAtOffset('hello  brave', 6), null);
  assert.equal(wordAtOffset('abc123 x', 2), null);
  assert.equal(wordAtOffset('', 0), null);
});

test('unique words and set comparison', () => {
  assert.deepEqual(uniqueWords(['teh teh good', 'good wrold', '']), ['teh', 'good', 'wrold']);
  assert.equal(sameWords(new Set(['a', 'b']), new Set(['b', 'a'])), true);
  assert.equal(sameWords(new Set(['a']), new Set(['a', 'b'])), false);
});

test('the personal dictionary persists and notifies', () => {
  const store = new Map<string, string>();
  const scope = globalThis as { localStorage?: unknown };
  const realStorage = scope.localStorage;
  const install = (stub: unknown) =>
    Object.defineProperty(globalThis, 'localStorage', { value: stub, configurable: true });
  install({
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  });
  try {
    reloadPersonalWords();
    assert.deepEqual(getPersonalWords(), []);
    let notified = 0;
    const unsubscribe = subscribePersonalWords(() => notified++);
    addPersonalWord('Mudrix');
    addPersonalWord('mudrix');
    addPersonalWord('  ');
    assert.deepEqual(getPersonalWords(), ['mudrix']);
    assert.equal(notified, 1);
    assert.equal(store.get('wz_spellcheck_words'), '["mudrix"]');
    assert.equal(isUserAccepted('MUDRIX'), true);
    reloadPersonalWords();
    assert.deepEqual(getPersonalWords(), ['mudrix']);
    ignoreWord('Zorp');
    assert.equal(isUserAccepted('zorp'), true);
    assert.deepEqual(getPersonalWords(), ['mudrix']);
    reloadPersonalWords();
    assert.equal(isUserAccepted('zorp'), false);
    notified = 0;
    removePersonalWord('MUDRIX');
    removePersonalWord('mudrix');
    assert.deepEqual(getPersonalWords(), []);
    assert.equal(notified, 1);
    unsubscribe();
    addPersonalWord('quux');
    assert.equal(notified, 1);
    store.set('wz_spellcheck_words', '{not json');
    reloadPersonalWords();
    assert.deepEqual(getPersonalWords(), []);
    install({
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('denied');
      },
    });
    reloadPersonalWords();
    addPersonalWord('blocked');
    assert.deepEqual(getPersonalWords(), ['blocked']);
  } finally {
    install(realStorage);
    reloadPersonalWords();
  }
});
