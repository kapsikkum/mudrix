import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  PACK_BUDGET_BYTES,
  formatKb,
  isTooLargeError,
  numberedPackName,
  packContentSize,
  splitImagesBySize,
} from '../src/app/features/room/roomsettings/packSize.ts';

const image = (n: number) => ({
  shortcode: `emoji_${n}`,
  url: `mxc://example.org/${'x'.repeat(24)}${n}`,
  usage: [] as string[],
  mimetype: 'image/png',
  info: { w: 128, h: 128, mimetype: 'image/png' },
});

const pack = (count: number) => ({
  stateKey: 'p',
  displayName: 'Pack',
  usage: ['emoticon'],
  images: Object.fromEntries(Array.from({ length: count }, (_, i) => [`emoji_${i}`, image(i)])),
});

test('size grows with the images', () => {
  assert.ok(packContentSize(pack(10)) > packContentSize(pack(1)));
});

test('a small pack stays in one chunk', () => {
  assert.equal(splitImagesBySize(pack(5)).length, 1);
});

test('a big pack is split and every chunk fits the budget', () => {
  const big = pack(1000);
  assert.ok(packContentSize(big) > PACK_BUDGET_BYTES);
  const chunks = splitImagesBySize(big);
  assert.ok(chunks.length > 1);
  for (const images of chunks) assert.ok(packContentSize({ ...big, images }) <= PACK_BUDGET_BYTES);
  assert.equal(
    chunks.reduce((n, c) => n + Object.keys(c).length, 0),
    1000
  );
});

test('split packs are numbered only when there are several', () => {
  assert.equal(numberedPackName('Pack', 0, 1), 'Pack');
  assert.equal(numberedPackName('Pack', 1, 3), 'Pack (2)');
});

test('sizes read as KB with one decimal under 10 KB', () => {
  assert.equal(formatKb(1536), '1.5 KB');
  assert.equal(formatKb(20 * 1024), '20 KB');
});

test('a too-large error is recognised by code, status or message', () => {
  assert.ok(isTooLargeError({ errcode: 'M_TOO_LARGE' }));
  assert.ok(isTooLargeError({ httpStatus: 413 }));
  assert.ok(isTooLargeError(new Error('event too large')));
  assert.ok(!isTooLargeError(new Error('nope')));
  assert.ok(!isTooLargeError(null));
});
