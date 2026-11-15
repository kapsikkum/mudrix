import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  favouriteGifItem,
  gifProviderForUrl,
} from '../src/app/features/timeline/composer/gifFavourites.ts';

test('a GIPHY URL belongs to GIPHY', () => {
  assert.equal(gifProviderForUrl('https://media.giphy.com/media/x/giphy.gif'), 'giphy');
});

test('a KLIPY URL, on any of its hosts, belongs to KLIPY', () => {
  assert.equal(gifProviderForUrl('https://klipy.com/gifs/x'), 'klipy');
  assert.equal(gifProviderForUrl('https://media.klipy.com/x.gif'), 'klipy');
});

test('a GIF seen on the homeserver keeps the default provider', () => {
  assert.equal(gifProviderForUrl('mxc://example.org/abc'), 'giphy');
});

test('an unusable URL still gives a savable item', () => {
  assert.equal(gifProviderForUrl('not a url'), 'giphy');
});

test('a favourite is drawn from its send URL alone', () => {
  const url = 'https://media.klipy.com/x.gif';
  assert.deepEqual(favouriteGifItem(url), {
    id: url,
    title: '',
    thumbUrl: url,
    sendUrl: url,
    width: 0,
    height: 0,
    provider: 'klipy',
  });
});
