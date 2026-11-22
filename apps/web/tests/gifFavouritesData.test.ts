import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  GIF_FAVOURITES_CAP,
  accountDataContent,
  descriptorsToCapture,
  filesForUrls,
  hasAccountDataFiles,
  mergeDescriptors,
  mergeUrls,
  parseFavourites,
  readLegacyFavourites,
  readLocalFiles,
  resolveFavourites,
  writeLocalFiles,
  type FavouriteStorage,
  type GifFavouriteFiles,
} from '../src/app/hooks/gifFavouritesData.ts';

/** A tiny Storage stand-in so the browser API is not needed in node:test. */
function fakeStorage(
  initial: Record<string, string> = {},
  fail = false
): FavouriteStorage & { _store: Map<string, string> } {
  const store = new Map(Object.entries(initial));
  const guard = () => {
    if (fail) throw new Error('storage unavailable');
  };
  return {
    _store: store,
    getItem: (key) => {
      guard();
      return store.get(key) ?? null;
    },
    setItem: (key, value) => {
      guard();
      store.set(key, value);
    },
    removeItem: (key) => {
      guard();
      store.delete(key);
    },
  };
}

const FILES_KEY = 'wz_gif_favourite_files::@alice:example.org';
const LEGACY_KEY = 'wz_gif_favourites::@alice:example.org';
const MUDDRIX = 'io.github.kapsikkum.mudrix.gif_favourites';

const file = (n: number) => ({
  url: `mxc://example.org/${n}`,
  key: `key-${n}`,
  iv: `iv-${n}`,
  v: 'v2',
});
const mxc = (n: number) => `mxc://example.org/${n}`;

test('parseFavourites reads urls and legacy descriptors, drops invalid urls and caps', () => {
  const parsed = parseFavourites({
    urls: [mxc(1), 'http://insecure/x', mxc(1), mxc(2), 'garbage'],
    files: { [mxc(1)]: file(1), 'http://insecure/x': file(9) },
  });
  assert.deepEqual(parsed.urls, [mxc(1), mxc(2)]);
  assert.deepEqual(parsed.files, { [mxc(1)]: file(1) });
});

test('parseFavourites keeps a descriptor even when urls and files drifted apart', () => {
  // An older build could rewrite the url list without touching the files map (or vice versa).
  // Keep every usable descriptor so it can still be captured and rendered for its favourite.
  const parsed = parseFavourites({
    urls: [mxc(1)],
    files: { [mxc(1)]: file(1), [mxc(2)]: file(2) },
  });
  assert.deepEqual(Object.keys(parsed.files).sort(), [mxc(1), mxc(2)].sort());
  // But resolveFavourites only ever returns descriptors for the urls actually shown.
  assert.deepEqual(
    resolveFavourites([{ urls: [mxc(1)], files: { [mxc(2)]: file(2) } }], {}).files,
    {}
  );
});

test('parseFavourites treats missing/garbage as empty', () => {
  assert.deepEqual(parseFavourites(null), { urls: [], files: {} });
  assert.deepEqual(parseFavourites({ urls: 'nope' }), { urls: [], files: {} });
});

test('urls list never grows past the cap', () => {
  const urls = Array.from({ length: GIF_FAVOURITES_CAP + 5 }, (_, i) => mxc(i));
  assert.equal(parseFavourites({ urls }).urls.length, GIF_FAVOURITES_CAP);
  assert.equal(mergeUrls([{ urls }]).length, GIF_FAVOURITES_CAP);
});

test('hasAccountDataFiles detects the old files-carrying format', () => {
  assert.equal(hasAccountDataFiles({ urls: [mxc(1)], files: {} }), true);
  assert.equal(hasAccountDataFiles({ urls: [mxc(1)] }), false);
  assert.equal(hasAccountDataFiles(null), false);
});

test('filesForUrls keeps only descriptors belonging to the (capped) url list', () => {
  const files = { [mxc(1)]: file(1), [mxc(9)]: file(9) };
  assert.deepEqual(filesForUrls([mxc(1)], files), { [mxc(1)]: file(1) });
});

test('readLegacyFavourites understands strings and old GIPHY-shaped objects', () => {
  const raw = JSON.stringify([
    mxc(1),
    { images: { downsized: { url: 'https://media.giphy.com/a.gif' } } },
    { images: { fixed_width: { url: 'https://media.klipy.com/b.gif' } } },
    {},
  ]);
  assert.deepEqual(readLegacyFavourites(fakeStorage({ [LEGACY_KEY]: raw }), LEGACY_KEY), [
    mxc(1),
    'https://media.giphy.com/a.gif',
    'https://media.klipy.com/b.gif',
  ]);
  assert.deepEqual(readLegacyFavourites(fakeStorage(), LEGACY_KEY), []);
});

test('mergeDescriptors combines local + both account-data events; local copy wins', () => {
  const local: GifFavouriteFiles = { [mxc(1)]: { key: 'local' } };
  const mudrix = { urls: [mxc(1), mxc(2)], files: { [mxc(1)]: file(1), [mxc(2)]: file(2) } };
  const upstream = { urls: [mxc(3)], files: { [mxc(3)]: file(3) } };
  const merged = mergeDescriptors([mudrix, upstream], local);
  assert.deepEqual(merged, {
    [mxc(1)]: { key: 'local' },
    [mxc(2)]: file(2),
    [mxc(3)]: file(3),
  });
});

test('mergeUrls merges both account-data events (not mudrix ?? upstream) and dedups', () => {
  const mudrix = { urls: [mxc(1)] };
  const upstream = { urls: [mxc(1), mxc(2)] };
  assert.deepEqual(mergeUrls([mudrix, upstream], [mxc(3)]), [mxc(1), mxc(2), mxc(3)]);
});

// (a) An old favourite right after the update: account data still has `files`, local store empty.
test('old-format favourite: descriptors come straight from account data, so it renders', () => {
  const accountData = [{ urls: [mxc(1)], files: { [mxc(1)]: file(1) } }];
  const resolved = resolveFavourites(accountData, {});
  assert.deepEqual(resolved.urls, [mxc(1)]);
  assert.deepEqual(resolved.files, { [mxc(1)]: file(1) });
});

// (b) A favourite created today: account data has urls only (no leak), descriptor is local.
test('new favourite: urls in account data, descriptor on this device, still renders', () => {
  const accountData = [{ urls: [mxc(1)] }];
  const local: GifFavouriteFiles = { [mxc(1)]: file(1) };
  const resolved = resolveFavourites(accountData, local);
  assert.deepEqual(resolved.files, { [mxc(1)]: file(1) });
  // The account-data event itself never carries the key.
  assert.equal('files' in accountData[0], false);
});

test('read path is robust to partial state: account data already stripped, only local has the key', () => {
  // This is the desktop failure state d45aa7c8 left behind: urls synced, keys device-local.
  const resolved = resolveFavourites([{ urls: [mxc(1)] }], { [mxc(1)]: file(1) });
  assert.deepEqual(resolved.files, { [mxc(1)]: file(1) });
});

test('read path recovers a descriptor stranded under another account scope', () => {
  const strandedKey = 'wz_gif_favourite_files::__anon__';
  const store = fakeStorage({ [strandedKey]: JSON.stringify({ [mxc(1)]: file(1) }) });
  const local = readLocalFiles(store, [FILES_KEY, strandedKey]);
  assert.deepEqual(local, { [mxc(1)]: file(1) });
  const resolved = resolveFavourites([{ urls: [mxc(1)] }], local);
  assert.deepEqual(resolved.files, { [mxc(1)]: file(1) });
});

test('migration copies legacy descriptors off account data onto the device, without a leak', () => {
  const accountData = [{ urls: [mxc(1), mxc(2)], files: { [mxc(1)]: file(1) } }];
  const store = fakeStorage();
  const urls = resolveFavourites(accountData, {}).urls;

  // What the migration must capture.
  const toCapture = descriptorsToCapture(accountData, readLocalFiles(store, [FILES_KEY]), urls);
  assert.deepEqual(toCapture, { [mxc(1)]: file(1) });
  assert.equal(writeLocalFiles(store, FILES_KEY, toCapture), true);

  // Account data is rewritten urls-only (no files) once a write happens.
  const rewritten = accountDataContent(urls);
  assert.deepEqual(rewritten, { urls: [mxc(1), mxc(2)] });
  assert.equal('files' in rewritten, false);

  // After the rewrite, the read path still resolves the descriptor from this device, so the
  // favourite renders rather than falling to a bare mxc ciphertext fetch.
  const after = resolveFavourites([rewritten], readLocalFiles(store, [FILES_KEY]));
  assert.deepEqual(after.files, { [mxc(1)]: file(1) });
});

test('accountDataContent never includes descriptors (the key-leak guarantee)', () => {
  const content = accountDataContent([mxc(1)]);
  assert.deepEqual(Object.keys(content), ['urls']);
  assert.equal(JSON.stringify(content).includes('key'), false);
  assert.equal(JSON.stringify(content).includes('files'), false);
});

test('writeLocalFiles reports failure and readLocalFiles tolerates broken/garbage storage', () => {
  const broken = fakeStorage({}, true);
  assert.equal(writeLocalFiles(broken, FILES_KEY, { [mxc(1)]: file(1) }), false);
  assert.deepEqual(readLocalFiles(broken, [FILES_KEY]), {});

  const garbage = fakeStorage({
    [FILES_KEY]: 'not json',
    'other::scope': JSON.stringify({ [mxc(2)]: file(2), 'bad-key': file(9) }),
  });
  assert.deepEqual(readLocalFiles(garbage, [FILES_KEY, 'other::scope']), { [mxc(2)]: file(2) });
});

test('empty descriptor set clears the local key rather than storing a leak', () => {
  const store = fakeStorage({ [FILES_KEY]: JSON.stringify({ [mxc(1)]: file(1) }) });
  assert.equal(writeLocalFiles(store, FILES_KEY, {}), true);
  assert.equal(store._store.has(FILES_KEY), false);
});

test('MUDDRIX event type stays descriptive and unused as a store of keys', () => {
  // Guard: the account-data type is a namespaced string, and its content is urls-only.
  assert.equal(typeof MUDDRIX, 'string');
  assert.deepEqual(accountDataContent([mxc(1)]), { urls: [mxc(1)] });
});
