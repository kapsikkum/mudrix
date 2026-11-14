import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  GIF_RECENT_CAP,
  parseRecentList,
  withRecentGif,
} from '../src/app/features/timeline/composer/gifRecentData.ts';
import { mergeHits } from '../src/app/hooks/mergeSearchHits.ts';

const item = (n: number) => ({
  id: `${n}`,
  title: `gif ${n}`,
  thumbUrl: `https://media.giphy.com/${n}.gif`,
  sendUrl: `https://media.giphy.com/${n}.gif`,
  width: 100,
  height: 50,
  provider: 'giphy' as const,
});

test('a stored recent list keeps its order and drops duplicates', () => {
  const parsed = parseRecentList(JSON.stringify([item(1), item(2), item(1)]));
  assert.deepEqual(
    parsed.map((gif) => gif.id),
    ['1', '2']
  );
});

test('recent entries that are unusable are skipped', () => {
  const parsed = parseRecentList(
    JSON.stringify([item(1), null, {}, 'x', { sendUrl: 'https://media.klipy.com/a.gif' }])
  );
  assert.equal(parsed.length, 2);
  assert.equal(parsed[1].provider, 'giphy');
});

test('garbage storage reads as empty', () => {
  assert.deepEqual(parseRecentList('not json'), []);
  assert.deepEqual(parseRecentList(null), []);
  assert.deepEqual(parseRecentList('{"a":1}'), []);
});

test('sending a GIF moves it to the front of the recent list', () => {
  const next = withRecentGif([item(1), item(2)], item(2));
  assert.deepEqual(
    next.map((gif) => gif.id),
    ['2', '1']
  );
});

test('the recent list never grows past its cap', () => {
  const list = Array.from({ length: GIF_RECENT_CAP }, (_, i) => item(i));
  const next = withRecentGif(list, item(GIF_RECENT_CAP));
  assert.equal(next.length, GIF_RECENT_CAP);
  assert.equal(next[0].id, `${GIF_RECENT_CAP}`);
});

test('a page of further results skips the hits the list already has', () => {
  const hit = (id: string) => ({
    roomId: '!r:x',
    eventId: id,
    sender: '@a:x',
    body: id,
    timestamp: 0,
  });
  const merged = mergeHits([hit('$a')], [hit('$a'), hit('$b')]);
  assert.deepEqual(
    merged.map((h) => h.eventId),
    ['$a', '$b']
  );
});
