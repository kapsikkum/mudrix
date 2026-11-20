import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mapMastodonStatus, mastodonHtmlToText } from '../src/util/mastodonPost.ts';

const statusUrl = 'https://mastodon.social/@Gargron/109380000000000000';

function sample(over: Record<string, unknown> = {}) {
  return {
    url: statusUrl,
    created_at: '2026-11-18T12:34:56.000Z',
    content: '<p>Hello <strong>world</strong><br>second line</p><p>Another paragraph</p>',
    spoiler_text: '',
    account: {
      display_name: 'Eugen Rochko',
      acct: 'Gargron',
      avatar: 'https://files.mastodon.social/avatars/original/avatar.png',
    },
    replies_count: 12,
    reblogs_count: 34,
    favourites_count: 5600,
    media_attachments: [
      {
        type: 'image',
        url: 'https://files.mastodon.social/media/one.jpg',
        preview_url: 'https://files.mastodon.social/media/one-small.jpg',
        description: 'A cat',
      },
      {
        type: 'image',
        url: 'http://insecure.example/two.jpg',
        preview_url: 'http://insecure.example/two-small.jpg',
      },
    ],
    ...over,
  };
}

test('maps a Mastodon status into text, author, avatar, media and counts', () => {
  const post = mapMastodonStatus(sample(), statusUrl);
  assert.ok(post);
  assert.equal(post.url, statusUrl);
  assert.equal(post.authorName, 'Eugen Rochko');
  assert.equal(post.handle, 'Gargron@mastodon.social');
  assert.equal(post.avatarUrl, 'https://files.mastodon.social/avatars/original/avatar.png');
  assert.equal(post.text, 'Hello world\nsecond line\n\nAnother paragraph');
  assert.equal(post.warning, undefined);
  assert.equal(post.createdAt, '2026-11-18T12:34:56.000Z');
  assert.equal(post.replies, 12);
  assert.equal(post.reblogs, 34);
  assert.equal(post.favourites, 5600);
  assert.deepEqual(post.media, [
    {
      type: 'image',
      url: 'https://files.mastodon.social/media/one.jpg',
      previewUrl: 'https://files.mastodon.social/media/one-small.jpg',
      description: 'A cat',
    },
  ]);
});

test('keeps a content warning and a remote handle', () => {
  const post = mapMastodonStatus(
    sample({
      spoiler_text: 'Spoilers',
      account: {
        display_name: '',
        acct: 'alice@example.social',
        avatar: 'javascript:alert(1)',
      },
    }),
    statusUrl
  );
  assert.ok(post);
  assert.equal(post.warning, 'Spoilers');
  assert.equal(post.authorName, 'alice@example.social');
  assert.equal(post.handle, 'alice@example.social');
  assert.equal(post.avatarUrl, undefined);
});

test('rejects a payload without an account and strips unsafe media', () => {
  assert.equal(mapMastodonStatus({ content: '<p>Hi</p>' }, statusUrl), null);
  assert.equal(mapMastodonStatus('not json', statusUrl), null);

  const post = mapMastodonStatus(
    sample({
      account: { display_name: 'X', acct: 'bad handle', avatar: 'https://x/a.png' },
    }),
    statusUrl
  );
  assert.equal(post, null);
});

test('HTML becomes readable text, never markup', () => {
  assert.equal(mastodonHtmlToText('<p>one</p><p>two &amp; three</p>'), 'one\n\ntwo & three');
  assert.equal(mastodonHtmlToText('<script>alert(1)</script>ok'), 'alert(1) ok');
});
