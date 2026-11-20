import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formatCompactCount, mapFxTwitterStatus, mapTwitterOEmbed } from '../src/util/xPost.ts';

const statusId = '2123406832731656417';

function sample(over: Record<string, unknown> = {}) {
  return {
    code: 200,
    tweet: {
      id: statusId,
      text: 'Hello\nworld\nhttps://t.co/abc123',
      author: {
        name: 'Left Hand Draft',
        screen_name: 'lefthanddraft',
        avatar_url: 'https://pbs.twimg.com/profile/avatar.jpg',
        is_blue_verified: true,
      },
      created_at: 'Tue Nov 18 12:34:56 +0000 2025',
      likes: 1200,
      replies: 34,
      retweets: 2300000,
      media: {
        photos: [
          { url: 'https://pbs.twimg.com/media/one.jpg', width: 1200, height: 800 },
          { url: 'http://insecure.example/two.jpg', width: 100, height: 100 },
        ],
        videos: [],
      },
      ...over,
    },
  };
}

test('maps an fxtwitter status into the card facts', () => {
  const post = mapFxTwitterStatus(sample(), statusId);
  assert.ok(post);
  assert.equal(post.id, statusId);
  assert.equal(post.authorName, 'Left Hand Draft');
  assert.equal(post.handle, 'lefthanddraft');
  assert.equal(post.avatarUrl, 'https://pbs.twimg.com/profile/avatar.jpg');
  assert.equal(post.verified, true);
  assert.equal(post.createdAt, 'Tue Nov 18 12:34:56 +0000 2025');
  assert.equal(post.likes, 1200);
  assert.equal(post.replies, 34);
  assert.equal(post.retweets, 2300000);

  // The media grid replaces the t.co media link, and the insecure photo is dropped.
  assert.equal(post.text, 'Hello\nworld');
  assert.deepEqual(post.photos, [
    { url: 'https://pbs.twimg.com/media/one.jpg', width: 1200, height: 800 },
  ]);
  assert.equal(post.video, undefined);
});

test('maps a video thumbnail and strips the trailer', () => {
  const post = mapFxTwitterStatus(
    sample({
      text: 'Watch this https://t.co/vid123',
      media: {
        photos: [],
        videos: [
          {
            thumbnail_url: 'https://pbs.twimg.com/ext_tw_video/thumb.jpg',
            url: 'https://video.twimg.com/ext_tw_video/clip.mp4',
          },
        ],
      },
    }),
    statusId
  );
  assert.ok(post);
  assert.equal(post.text, 'Watch this');
  assert.deepEqual(post.video, {
    thumbnailUrl: 'https://pbs.twimg.com/ext_tw_video/thumb.jpg',
    url: 'https://video.twimg.com/ext_tw_video/clip.mp4',
  });
});

test('rejects a wrong code, a mismatched id or a malformed author', () => {
  assert.equal(mapFxTwitterStatus({ ...sample(), code: 404 }, statusId), null);
  assert.equal(mapFxTwitterStatus(sample({ id: '999999999999999999' }), statusId), null);
  assert.equal(
    mapFxTwitterStatus(sample({ author: { name: 'x', screen_name: 'bad handle' } }), statusId),
    null
  );
  assert.equal(mapFxTwitterStatus({ code: 200, tweet: {} }, statusId), null);
  assert.equal(mapFxTwitterStatus('not json', statusId), null);
});

test('the oEmbed fallback keeps the author and the post words', () => {
  const json = {
    author_name: 'Left Hand Draft',
    author_url: 'https://twitter.com/lefthanddraft',
    html: '<blockquote class="twitter-tweet"><p lang="en" dir="ltr">Hello<br>world <a href="https://t.co/abc">pic.twitter.com/media</a></p>&mdash; Left Hand Draft (@lefthanddraft) <a href="https://twitter.com/lefthanddraft/status/2123406832731656417">November 18, 2025</a></blockquote>',
  };
  const post = mapTwitterOEmbed(json, statusId);
  assert.ok(post);
  assert.equal(post.authorName, 'Left Hand Draft');
  assert.equal(post.handle, 'lefthanddraft');
  assert.equal(post.text, 'Hello\nworld');
  assert.deepEqual(post.photos, []);
  assert.equal(mapTwitterOEmbed({ html: json.html }, statusId), null);
});

test('counts read compactly beside the icons', () => {
  assert.equal(formatCompactCount(0), '0');
  assert.equal(formatCompactCount(999), '999');
  assert.equal(formatCompactCount(1500), '1.5K');
  assert.equal(formatCompactCount(2300000), '2.3M');
});
