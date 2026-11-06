import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseYouTubeUrl } from '../src/util/youtube.ts';

test('recognises the usual YouTube link shapes', () => {
  assert.deepEqual(parseYouTubeUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ'), {
    id: 'dQw4w9WgXcQ',
    start: 0,
  });
  assert.deepEqual(parseYouTubeUrl('https://youtu.be/dQw4w9WgXcQ?t=90'), {
    id: 'dQw4w9WgXcQ',
    start: 90,
  });
  assert.deepEqual(parseYouTubeUrl('https://m.youtube.com/shorts/dQw4w9WgXcQ'), {
    id: 'dQw4w9WgXcQ',
    start: 0,
  });
  assert.equal(
    parseYouTubeUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=1h2m3s')?.start,
    3723
  );
});

test('rejects lookalikes and non-video links', () => {
  assert.equal(parseYouTubeUrl('https://evil-youtube.com/watch?v=dQw4w9WgXcQ'), null);
  assert.equal(parseYouTubeUrl('https://www.youtube.com/channel/UC123'), null);
  assert.equal(parseYouTubeUrl('https://www.youtube.com/watch?v=short'), null);
  assert.equal(parseYouTubeUrl('javascript:alert(1)'), null);
  assert.equal(parseYouTubeUrl('not a url'), null);
});
