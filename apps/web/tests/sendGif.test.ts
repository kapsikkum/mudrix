import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import type { GifItem } from '../src/app/features/timeline/composer/gifProviders/types.ts';
import {
  GIF_EVENT_TYPE,
  GIF_SOURCE_FIELD,
  gifContent,
} from '../src/app/features/timeline/composer/gifEventContent.ts';

const item: GifItem = {
  id: 'DsA5XPVvKIstEah1by',
  title: 'Warning Tim And Eric GIF',
  thumbUrl: 'https://media.giphy.com/x.gif',
  sendUrl: 'https://media.giphy.com/x.gif',
  width: 480,
  height: 444,
  provider: 'giphy',
};

test('a GIF is sent as an ordinary image message, never a sticker', () => {
  // The core serialises the event type into typed content: `m.sticker` is a different shape and
  // "Unknown event type" is what a mismatched body produces.
  assert.equal(GIF_EVENT_TYPE, 'm.room.message');

  const content = gifContent(
    item,
    { url: 'mxc://mudrix.test/zP7wcS04GGkImDGLSuUYT8WVoEGwS02h' },
    { mimetype: 'image/gif', is_animated: true }
  );

  assert.equal(content.msgtype, 'm.image');
  assert.equal(content.body, 'Warning Tim And Eric GIF');
  assert.deepEqual(content.info, { mimetype: 'image/gif', is_animated: true });
  assert.equal(content.url, 'mxc://mudrix.test/zP7wcS04GGkImDGLSuUYT8WVoEGwS02h');
  assert.deepEqual(content[GIF_SOURCE_FIELD], { provider: 'giphy', id: 'DsA5XPVvKIstEah1by' });
  assert.equal('file' in content, false);
});

test('a GIF uploaded to an encrypted room carries its file descriptor, not a url', () => {
  const file = { url: 'mxc://mudrix.test/encrypted', key: 'k', iv: 'i', hashes: {}, v: 'v2' };
  const content = gifContent(
    item,
    { file },
    { mimetype: 'image/gif', size: 2189, is_animated: true }
  );

  assert.equal(content.msgtype, 'm.image');
  assert.deepEqual(content.file, file);
  assert.equal('url' in content, false);
});

test('a GIF without a title still has a body to fall back on', () => {
  const content = gifContent(
    { ...item, title: '' },
    { url: 'mxc://x/y' },
    { mimetype: 'image/gif' }
  );
  assert.equal(content.body, 'GIF');
});

test('the sender posts room messages, not stickers', () => {
  // Guards the call site too: the content builder alone would not stop a stray `m.sticker`.
  const source = readFileSync(
    new URL('../src/app/features/timeline/composer/sendGif.ts', import.meta.url),
    'utf8'
  );
  assert.match(source, /GIF_EVENT_TYPE/);
  assert.equal(source.includes("'m.sticker'"), false);
});
