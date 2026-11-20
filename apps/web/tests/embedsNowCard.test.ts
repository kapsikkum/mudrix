import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  accentColor,
  galleryLayout,
  parseEmbedMarkdown,
  safeCardUrl,
  sanitizeEmbedCard,
  type MarkdownSegment,
} from '../src/util/embedsNowCard.ts';
import { createCardCache } from '../src/util/embedsNowCache.ts';
import {
  audioCard,
  blueskyCard,
  hostileCard,
  instagramCard,
  redditCard,
  tiktokCard,
  xCard,
} from './fixtures/embedsNowCards.ts';

const text = (segments: MarkdownSegment[]) => segments.map((s) => s.text).join('');

test('markdown: bold, links, subtext lines and newlines', () => {
  const lines = parseEmbedMarkdown(
    '**Name** says [hi](https://example.com/a)\n-# small print\nplain'
  );
  assert.equal(lines.length, 3);
  assert.deepEqual(lines[0].segments, [
    { kind: 'text', text: 'Name', bold: true },
    { kind: 'text', text: ' says ', bold: false },
    { kind: 'link', text: 'hi', url: 'https://example.com/a', bold: false },
  ]);
  assert.equal(lines[1].small, true);
  assert.equal(text(lines[1].segments), 'small print');
  assert.equal(lines[2].small, false);
});

test('markdown: a bold link keeps both, and bold toggles off', () => {
  const [line] = parseEmbedMarkdown('**[Jesse (@jc)](https://x.com/jc)** tail');
  assert.deepEqual(line.segments[0], {
    kind: 'link',
    text: 'Jesse (@jc)',
    url: 'https://x.com/jc',
    bold: true,
  });
  assert.deepEqual(line.segments[1], { kind: 'text', text: ' tail', bold: false });
});

test('markdown: backslash escapes are unescaped and never start formatting', () => {
  const [line] = parseEmbedMarkdown('a \\- b \\(c\\) \\#tag \\*\\*not bold\\*\\* \\[x\\](y)');
  assert.equal(text(line.segments), 'a - b (c) #tag **not bold** [x](y)');
  assert.ok(line.segments.every((s) => s.kind === 'text' && !s.bold));
  // an escape of a letter is not an escape
  assert.equal(text(parseEmbedMarkdown('a\\nb')[0].segments), 'a\\nb');
});

test('markdown: parentheses in an address are balanced and escaped ones unescaped', () => {
  const [line] = parseEmbedMarkdown('[wiki](https://en.wikipedia.org/wiki/Foo_(bar)) after');
  assert.equal(line.segments[0].kind, 'link');
  assert.equal(
    (line.segments[0] as { url: string }).url,
    'https://en.wikipedia.org/wiki/Foo_(bar)'
  );
  assert.equal(text(line.segments), 'wiki after');
});

test('markdown: hostile input stays plain text', () => {
  const [line] = parseEmbedMarkdown(
    '<img src=x onerror=alert(1)> [a](javascript:alert(1)) [b](data:text/html,x) [c](http://example.com) [d](//evil.com) [e](https://127.0.0.1/x)'
  );
  assert.ok(line.segments.every((s) => s.kind === 'text'));
  const rendered = text(line.segments);
  assert.ok(rendered.startsWith('<img src=x onerror=alert(1)> a b c d e'));
  assert.ok(!rendered.includes('javascript:'));
});

test('markdown: unterminated links and emphasis do not throw or hang', () => {
  for (const input of [
    '[a](https://example.com',
    '[a]',
    '**',
    '[',
    '](',
    '[a](',
    '\\',
    '-#',
    '-# ',
  ]) {
    assert.doesNotThrow(() => parseEmbedMarkdown(input), input);
  }
  assert.equal(
    text(parseEmbedMarkdown('[a](https://example.com')[0].segments),
    '[a](https://example.com'
  );
  assert.equal(parseEmbedMarkdown('x'.repeat(100_000)).length, 1);
  assert.ok(parseEmbedMarkdown('a\n'.repeat(1000)).length <= 40);
});

test('safeCardUrl accepts public https and nothing else', () => {
  assert.equal(safeCardUrl('https://pbs.twimg.com/a.jpg'), 'https://pbs.twimg.com/a.jpg');
  for (const bad of [
    'http://pbs.twimg.com/a.jpg',
    'javascript:alert(1)',
    'data:image/png;base64,AAAA',
    'blob:https://x/y',
    'https://127.0.0.1/a',
    'https://localhost/a',
    'https://user:pw@example.com/',
    'https://example.com:8443/',
    '//example.com/a',
    '',
    null,
    42,
  ]) {
    assert.equal(safeCardUrl(bad), null, String(bad));
  }
});

test('accent: 0xRRGGBB becomes a hex colour, anything else none', () => {
  assert.equal(accentColor(1940464), '#1d9bf0');
  assert.equal(accentColor(0), '#000000');
  assert.equal(accentColor(null), null);
  assert.equal(accentColor(0x1000000), null);
  assert.equal(accentColor(-1), null);
  assert.equal(accentColor(1.5), null);
});

test('X card: text with an avatar, one video, a button', () => {
  const card = sanitizeEmbedCard(xCard);
  assert.equal(card.accent, '#1d9bf0');
  assert.deepEqual(
    card.blocks.map((b) => b.type),
    ['text', 'gallery', 'buttons']
  );
  const [header, gallery, buttons] = card.blocks;
  assert.equal(header.type === 'text' && header.lines.length, 4);
  assert.equal(header.type === 'text' && header.thumbnail?.kind, 'image');
  assert.equal(header.type === 'text' && header.lines[2].small, true);
  assert.equal(gallery.type === 'gallery' && gallery.items[0].kind, 'video');
  assert.equal(buttons.type === 'buttons' && buttons.buttons[0].label, 'Open on X');
});

test('Instagram, TikTok and Bluesky cards keep separators, videos and images', () => {
  assert.deepEqual(
    sanitizeEmbedCard(instagramCard).blocks.map((b) => b.type),
    ['text', 'gallery', 'separator', 'buttons']
  );
  const tiktok = sanitizeEmbedCard(tiktokCard);
  assert.ok(safeCardUrl((tiktok.blocks[0] as { thumbnail: { url: string } }).thumbnail.url));
  const bsky = sanitizeEmbedCard(blueskyCard);
  const gallery = bsky.blocks[1];
  assert.equal(gallery.type === 'gallery' && gallery.items[0].description, 'A photo');
});

test('an audio item stays audio; no accent means no colour', () => {
  const card = sanitizeEmbedCard(audioCard);
  assert.equal(card.accent, null);
  const gallery = card.blocks[1];
  assert.equal(gallery.type === 'gallery' && gallery.items[0].kind, 'audio');
});

test('a gallery shows ten pictures and counts the rest', () => {
  const gallery = sanitizeEmbedCard(redditCard).blocks.find((b) => b.type === 'gallery');
  assert.ok(gallery && gallery.type === 'gallery');
  assert.equal(gallery.items.length, 10);
  assert.equal(gallery.hidden, 2);
});

test('hostile card: only safe media, links and buttons survive', () => {
  const card = sanitizeEmbedCard(hostileCard);
  assert.equal(card.url, null);
  assert.equal(card.accent, null);
  const [header, gallery, buttons, ...rest] = card.blocks;
  assert.equal(rest.length, 0, 'unknown block types are dropped');

  assert.ok(header.type === 'text');
  assert.equal(header.thumbnail, null, 'an http thumbnail is dropped');
  const links = header.lines.flatMap((l) => l.segments).filter((s) => s.kind === 'link');
  assert.deepEqual(
    links.map((l) => (l as { url: string }).url),
    ['https://example.com/ok']
  );

  assert.ok(gallery.type === 'gallery');
  assert.deepEqual(
    gallery.items.map((i) => i.url),
    ['https://pbs.twimg.com/ok.jpg']
  );

  assert.ok(buttons.type === 'buttons');
  assert.deepEqual(buttons.buttons, [{ label: 'Good', url: 'https://example.com/good' }]);
});

test('a card with nothing renderable has no blocks', () => {
  const card = sanitizeEmbedCard({
    service: 'X',
    url: 'https://x.com/a',
    accent: null,
    blocks: [
      { type: 'text', markdown: '', thumbnail: null },
      { type: 'gallery', items: [] },
      { type: 'buttons', buttons: [] },
    ],
  });
  assert.equal(card.blocks.length, 0);
});

test('gallery layout: one wide, two side by side, a mosaic for three or four, rows of three', () => {
  const sum = (spans: number[]) => spans.reduce((a, b) => a + b, 0);
  assert.deepEqual(galleryLayout(0), []);
  assert.deepEqual(galleryLayout(1), [6]);
  assert.deepEqual(galleryLayout(2), [3, 3]);
  assert.deepEqual(galleryLayout(3), [6, 3, 3]);
  assert.deepEqual(galleryLayout(4), [3, 3, 3, 3]);
  assert.deepEqual(galleryLayout(5), [3, 3, 2, 2, 2]);
  assert.deepEqual(galleryLayout(10), [6, 2, 2, 2, 2, 2, 2, 2, 2, 2]);
  for (let n = 1; n <= 10; n++) {
    assert.equal(galleryLayout(n).length, n, `n=${n}`);
    assert.equal(sum(galleryLayout(n)) % 6, 0, `n=${n} fills whole rows`);
  }
  assert.equal(galleryLayout(40).length, 10);
});

test('card cache: shares a request in flight and keeps answers', async () => {
  let calls = 0;
  const cache = createCardCache(async (url) => {
    calls++;
    return url.endsWith('/none') ? null : { ...xCard, url };
  });
  const [a, b] = await Promise.all([cache.get('https://x.com/a'), cache.get('https://x.com/a')]);
  assert.equal(a, b);
  assert.equal(calls, 1);
  await cache.get('https://x.com/a');
  assert.equal(calls, 1);
  assert.equal(await cache.get('https://x.com/none'), null);
  assert.equal(await cache.get('https://x.com/none'), null);
  assert.equal(calls, 2, '"no card" is an answer too');
});

test('card cache: a failure is not remembered, so the next look retries', async () => {
  let calls = 0;
  const cache = createCardCache(async () => {
    calls++;
    if (calls === 1) throw new Error('offline');
    return xCard;
  });
  await assert.rejects(cache.get('https://x.com/a'), /offline/);
  assert.equal(await cache.get('https://x.com/a'), xCard);
  assert.equal(calls, 2);
});

test('card cache: forgets the oldest answer past its limit', async () => {
  let calls = 0;
  const cache = createCardCache(async () => {
    calls++;
    return xCard;
  }, 2);
  await cache.get('https://x.com/1');
  await cache.get('https://x.com/2');
  await cache.get('https://x.com/3');
  await cache.get('https://x.com/1');
  assert.equal(calls, 4);
});
