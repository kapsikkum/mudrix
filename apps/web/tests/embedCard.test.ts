import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  mastodonEmbedData,
  providerEmbedData,
  redditEmbedData,
  redditSubreddit,
  xPostEmbedData,
} from '../src/util/embedCard.ts';
import type { MastodonPost } from '../src/util/mastodonPost.ts';
import type { XPost } from '../src/util/xPost.ts';

const xPost: XPost = {
  id: '2123406832731656417',
  text: 'Gemini 4 Neon has the best CoT',
  authorName: 'Wyatt Walls',
  handle: 'lefthanddraft',
  avatarUrl: 'https://pbs.twimg.com/profile_images/avatar.jpg',
  verified: true,
  createdAt: 'Thu Nov 19 13:23:34 +0000 2026',
  likes: 1752,
  replies: 43,
  retweets: 57,
  photos: [{ url: 'https://pbs.twimg.com/media/one.png', width: 543, height: 242 }],
};

test('X rich fields fill the shared embed shell', () => {
  const data = xPostEmbedData(
    xPost,
    'https://x.com/lefthanddraft/status/2123406832731656417',
    'Open on X'
  );
  assert.equal(data.accent, '#1d9bf0');
  assert.deepEqual(data.author, {
    name: 'Wyatt Walls',
    meta: '@lefthanddraft',
    iconUrl: 'https://pbs.twimg.com/profile_images/avatar.jpg',
    verified: true,
    url: 'https://x.com/lefthanddraft/status/2123406832731656417',
  });
  assert.equal(data.description, 'Gemini 4 Neon has the best CoT');
  assert.equal(data.title, undefined);
  assert.match(data.footer?.text ?? '', /2026/);
  assert.deepEqual(data.footer?.stats, [
    { kind: 'reply', value: '43' },
    { kind: 'repost', value: '57' },
    { kind: 'like', value: '1.8K' },
  ]);
  assert.equal(data.footer?.label, 'Open on X');
});

test('Mastodon rich fields fill the shared embed shell', () => {
  const post: MastodonPost = {
    url: 'https://mastodon.social/@Gargron/109380000000000000',
    authorName: 'Eugen Rochko',
    handle: 'Gargron@mastodon.social',
    avatarUrl: 'https://files.mastodon.social/avatar.png',
    text: 'Hello world',
    warning: 'Spoilers',
    createdAt: '2026-11-18T12:34:56.000Z',
    replies: 12,
    reblogs: 34,
    favourites: 5600,
    media: [{ type: 'image', url: 'https://files.mastodon.social/one.jpg' }],
  };
  const data = mastodonEmbedData(post, 'Open on Mastodon');
  assert.equal(data.accent, '#6364ff');
  assert.equal(data.author?.name, 'Eugen Rochko');
  assert.equal(data.author?.meta, '@Gargron@mastodon.social');
  assert.equal(data.description, 'Hello world');
  assert.equal(data.warning, 'Spoilers');
  assert.deepEqual(data.footer?.stats, [
    { kind: 'reply', value: '12' },
    { kind: 'boost', value: '34' },
    { kind: 'favourite', value: '5.6K' },
  ]);
});

test('Reddit puts the subreddit and author in the shell and scores in the footer', () => {
  const url = 'https://www.reddit.com/r/aww/comments/abc123/a_cat/';
  assert.equal(redditSubreddit(url), 'aww');
  assert.equal(redditSubreddit('https://redd.it/abc123'), undefined);

  const data = redditEmbedData({
    url,
    title: 'A very good cat',
    description: 'Selftext about the cat',
    author: 'u/someone',
    score: 1200,
    comments: 45,
    openLabel: 'Open on Reddit',
  });
  assert.equal(data.accent, '#ff4500');
  assert.deepEqual(data.author, { name: 'r/aww', meta: 'u/someone', url });
  assert.equal(data.title, 'A very good cat');
  assert.equal(data.titleUrl, url);
  assert.equal(data.description, 'Selftext about the cat');
  assert.deepEqual(data.footer?.stats, [
    { kind: 'score', value: '1.2K' },
    { kind: 'comments', value: '45' },
  ]);

  const noTitle = redditEmbedData({ url, openLabel: 'Open on Reddit' });
  assert.equal(noTitle.title, 'A cat');

  const urlAsTitle = redditEmbedData({ url, title: url, openLabel: 'Open on Reddit' });
  assert.equal(urlAsTitle.title, 'A cat');

  const idOnly = redditEmbedData({
    url: 'https://www.reddit.com/r/aww/comments/abc123/',
    openLabel: 'Open on Reddit',
  });
  assert.equal(idOnly.title, 'https://www.reddit.com/r/aww/comments/abc123/');
});

test('provider embeds take the shared shell accent and footer from the registry', () => {
  const instagram = providerEmbedData({
    service: 'instagram',
    url: 'https://www.instagram.com/p/CabcDEF_123/',
    title: 'A post',
    description: 'Caption',
    thumbnailUrl: 'https://scontent.example/photo.jpg',
    openLabel: 'Open on Instagram',
  });
  assert.equal(instagram.accent, '#e1306c');
  assert.equal(instagram.footer?.text, 'Instagram');
  assert.equal(instagram.title, 'A post');
  assert.equal(instagram.description, 'Caption');
  assert.equal(instagram.thumbnailUrl, 'https://scontent.example/photo.jpg');

  const short = providerEmbedData({
    service: 'x',
    url: 'https://t.co/abc123',
    title: 'https://t.co/abc123',
    openLabel: 'Open on X',
  });
  assert.equal(short.accent, '#1d9bf0');
  assert.equal(short.title, 'https://t.co/abc123');
  assert.equal(short.footer?.text, 'X');
});
