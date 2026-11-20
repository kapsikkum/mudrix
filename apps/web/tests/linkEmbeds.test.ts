import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  DEFAULT_LINK_EMBED_MODE,
  LINK_EMBED_DEFAULT_MODES,
  LINK_EMBED_PREFERENCE_KEYS,
  LINK_EMBED_SERVICES,
  isEmbedsNowService,
  matchLinkEmbed,
  planLinkEmbed,
  resolveLinkEmbedMode,
  resolveServiceLinkEmbedMode,
} from '../src/util/linkEmbeds.ts';

const spotifyId = '4cOdK2wGLETKBW3PvgPWqT';

test('YouTube is recognised but stays on its own player', () => {
  const match = matchLinkEmbed('https://youtu.be/dQw4w9WgXcQ?t=90');
  assert.equal(match?.service, 'youtube');
  assert.equal(match?.existing, true);
  assert.equal(match?.embedUrl, null);
  assert.equal(match?.url, 'https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=90');
});

test('Spotify tracks, albums, playlists, episodes, shows and artists use the official embed', () => {
  for (const type of ['track', 'album', 'playlist', 'episode', 'show', 'artist']) {
    const match = matchLinkEmbed(`https://open.spotify.com/${type}/${spotifyId}`);
    assert.equal(match?.service, 'spotify', type);
    assert.equal(match?.embedUrl, `https://open.spotify.com/embed/${type}/${spotifyId}`);
    assert.equal(match?.url, `https://open.spotify.com/${type}/${spotifyId}`);
    assert.equal(match?.player?.width, 520);
    assert.equal(match?.player?.height, type === 'track' || type === 'episode' ? 152 : 352, type);
  }

  assert.equal(
    matchLinkEmbed(`https://open.spotify.com/intl-de/album/${spotifyId}?si=abc`)?.embedUrl,
    `https://open.spotify.com/embed/album/${spotifyId}`
  );
  assert.equal(
    matchLinkEmbed(`https://open.spotify.com/embed/playlist/${spotifyId}`)?.embedUrl,
    `https://open.spotify.com/embed/playlist/${spotifyId}`
  );
  assert.equal(
    matchLinkEmbed('http://open.spotify.com/track/' + spotifyId)?.embedUrl?.slice(0, 8),
    'https://'
  );
  assert.equal(matchLinkEmbed('https://spotify.link/abc123')?.embedUrl, null);
});

test('X and Twitter posts become cards with the author from the URL', () => {
  const post = matchLinkEmbed('https://twitter.com/jack/status/20');
  assert.equal(post?.service, 'x');
  assert.equal(post?.embedUrl, null);
  assert.equal(post?.url, 'https://x.com/jack/status/20');
  assert.equal(post?.author, '@jack');
  assert.equal(post?.xStatusId, '20');

  assert.equal(
    matchLinkEmbed('https://x.com/lefthanddraft/status/2123406832731656417')?.xStatusId,
    '2123406832731656417'
  );

  assert.equal(
    matchLinkEmbed('https://x.com/i/web/status/1234567890')?.url,
    'https://x.com/i/status/1234567890'
  );
  assert.equal(matchLinkEmbed('https://t.co/abc123')?.embedUrl, null);
  // A profile has no card of its own: only embeds.now draws it.
  const profile = matchLinkEmbed('https://x.com/jack');
  assert.equal(profile?.service, 'x');
  assert.equal(profile?.embedsNowOnly, true);
  assert.equal(matchLinkEmbed('https://x.com/home'), null);
  assert.equal(matchLinkEmbed('https://x.com/i/flow/login'), null);
});

test('Instagram posts and reels get an embed; share links stay cards', () => {
  const post = matchLinkEmbed('https://www.instagram.com/p/CabcDEF_123/');
  assert.equal(post?.service, 'instagram');
  assert.equal(post?.embedUrl, 'https://www.instagram.com/p/CabcDEF_123/embed/');

  const reel = matchLinkEmbed('https://instagram.com/reel/CabcDEF_123/?utm_source=ig_web');
  assert.equal(reel?.embedUrl, 'https://www.instagram.com/reel/CabcDEF_123/embed/');

  assert.equal(
    matchLinkEmbed('https://instagr.am/p/CabcDEF_123/')?.embedUrl,
    'https://www.instagram.com/p/CabcDEF_123/embed/'
  );
  assert.equal(matchLinkEmbed('https://www.instagram.com/share/BAabc123')?.embedUrl, null);
});

test('TikTok videos use embed v2, short links stay cards', () => {
  const video = matchLinkEmbed('https://www.tiktok.com/@scout2015/video/6718335390845095173');
  assert.equal(video?.service, 'tiktok');
  assert.equal(video?.embedUrl, 'https://www.tiktok.com/embed/v2/6718335390845095173');
  assert.equal(video?.author, '@scout2015');

  assert.equal(
    matchLinkEmbed('https://www.tiktok.com/embed/v2/6718335390845095173')?.embedUrl,
    'https://www.tiktok.com/embed/v2/6718335390845095173'
  );
  assert.equal(matchLinkEmbed('https://vm.tiktok.com/ZMabc123/')?.embedUrl, null);
  assert.equal(matchLinkEmbed('https://www.tiktok.com/t/ZTabc123/')?.embedUrl, null);
});

test('Reddit posts use the official embed, short links stay cards', () => {
  const post = matchLinkEmbed('https://www.reddit.com/r/aww/comments/abc123/a_cat/');
  assert.equal(post?.service, 'reddit');
  assert.equal(
    post?.embedUrl,
    'https://embed.reddit.com/r/aww/comments/abc123/?embed=true&ref_source=embed&showmore=false'
  );
  assert.equal(post?.author, 'r/aww');

  assert.equal(
    matchLinkEmbed('https://old.reddit.com/r/aww/comments/abc123')?.embedUrl,
    'https://embed.reddit.com/r/aww/comments/abc123/?embed=true&ref_source=embed&showmore=false'
  );
  assert.equal(matchLinkEmbed('https://redd.it/abc123')?.embedUrl, null);
  assert.equal(matchLinkEmbed('https://www.reddit.com/r/aww/s/AbCdEf')?.embedUrl, null);
});

test('Facebook posts and videos use the plugin, short links stay cards', () => {
  const post = matchLinkEmbed('https://www.facebook.com/zuck/posts/10102577175875681');
  assert.equal(post?.service, 'facebook');
  assert.equal(
    post?.embedUrl,
    `https://www.facebook.com/plugins/post.php?href=${encodeURIComponent(
      'https://www.facebook.com/zuck/posts/10102577175875681'
    )}&show_text=true&width=400`
  );

  const permalink = matchLinkEmbed('https://m.facebook.com/permalink.php?story_fbid=123&id=456');
  assert.ok(
    permalink?.embedUrl?.startsWith(
      'https://www.facebook.com/plugins/post.php?href=https%3A%2F%2Fwww.facebook.com%2Fpermalink.php'
    )
  );
  assert.equal(
    matchLinkEmbed('https://www.facebook.com/watch/?v=123456789')?.embedUrl?.includes(
      '/plugins/video.php'
    ),
    true
  );
  assert.equal(matchLinkEmbed('https://fb.watch/abc123/')?.embedUrl, null);
});

test('Threads posts embed; /t/ share links stay cards', () => {
  const post = matchLinkEmbed('https://www.threads.net/@zuck/post/Cabc123');
  assert.equal(post?.service, 'threads');
  assert.equal(post?.embedUrl, 'https://www.threads.net/@zuck/post/Cabc123/embed');
  assert.equal(
    matchLinkEmbed('https://threads.com/@zuck/post/Cabc123')?.embedUrl,
    'https://www.threads.net/@zuck/post/Cabc123/embed'
  );
  assert.equal(matchLinkEmbed('https://threads.net/t/Cabc123')?.embedUrl, null);
});

test('Bluesky embeds a DID URL and resolves handle URLs to the same embed', () => {
  const did = matchLinkEmbed('https://bsky.app/profile/did:plc:abc123/post/3kabc');
  assert.equal(did?.service, 'bluesky');
  assert.equal(
    did?.embedUrl,
    'https://embed.bsky.app/embed/did:plc:abc123/app.bsky.feed.post/3kabc'
  );

  const handle = matchLinkEmbed('https://bsky.app/profile/bsky.app/post/3kabc');
  assert.equal(handle?.embedUrl, null);
  assert.equal(handle?.url, 'https://bsky.app/profile/bsky.app/post/3kabc');
  assert.equal(handle?.resolve?.kind, 'bluesky');
  assert.equal(handle?.resolve?.rkey, '3kabc');
  assert.match(handle?.resolve?.url ?? '', /resolveHandle\?handle=bsky\.app$/);
});

test('Mastodon works on any instance and asks its public status API', () => {
  const post = matchLinkEmbed('https://mastodon.social/@Gargron/109380000000000000');
  assert.equal(post?.service, 'mastodon');
  assert.equal(post?.embedUrl, null);
  assert.equal(post?.author, '@Gargron@mastodon.social');
  assert.deepEqual(post?.metadata, {
    kind: 'mastodon',
    url: 'https://mastodon.social/api/v1/statuses/109380000000000000',
    allow: ['mastodon.social'],
  });

  assert.equal(
    matchLinkEmbed('https://fosstodon.org/users/kev/statuses/109380000000000000')?.service,
    'mastodon'
  );
  assert.equal(matchLinkEmbed('https://mastodon.social/@Gargron'), null);
  assert.equal(matchLinkEmbed('https://example.com/@user/123'), null);
});

test('Pinterest pins embed; pin.it and locale hosts are handled', () => {
  const pin = matchLinkEmbed('https://www.pinterest.com/pin/123456789012345678/');
  assert.equal(pin?.service, 'pinterest');
  assert.equal(pin?.embedUrl, 'https://assets.pinterest.com/ext/embed.html?id=123456789012345678');
  assert.equal(
    matchLinkEmbed('https://uk.pinterest.com/pin/123456789/')?.embedUrl,
    'https://assets.pinterest.com/ext/embed.html?id=123456789'
  );
  assert.equal(matchLinkEmbed('https://pin.it/abc123')?.embedUrl, null);
});

test('LinkedIn URN updates embed; post slugs and lnkd.in stay cards', () => {
  const share = matchLinkEmbed(
    'https://www.linkedin.com/feed/update/urn:li:share:7123456789012345678'
  );
  assert.equal(share?.service, 'linkedin');
  assert.equal(
    share?.embedUrl,
    'https://www.linkedin.com/embed/feed/update/urn:li:share:7123456789012345678'
  );
  assert.equal(
    matchLinkEmbed('https://linkedin.com/feed/update/urn:li:activity:7123456789012345678')
      ?.embedUrl,
    'https://www.linkedin.com/embed/feed/update/urn:li:activity:7123456789012345678'
  );
  assert.equal(
    matchLinkEmbed('https://www.linkedin.com/posts/someone_slug-activity-7123456789012345678-AbCd')
      ?.embedUrl,
    null
  );
  assert.equal(matchLinkEmbed('https://lnkd.in/abc123')?.embedUrl, null);
});

test('Tumblr posts embed from the blog host or the www path', () => {
  const blog = matchLinkEmbed('https://staff.tumblr.com/123456789012');
  assert.equal(blog?.service, 'tumblr');
  assert.equal(blog?.embedUrl, 'https://www.tumblr.com/staff/123456789012/embed');

  assert.equal(
    matchLinkEmbed('https://staff.tumblr.com/post/123456789012/a-title')?.embedUrl,
    'https://www.tumblr.com/staff/123456789012/embed'
  );
  assert.equal(
    matchLinkEmbed('https://www.tumblr.com/staff/123456789012')?.embedUrl,
    'https://www.tumblr.com/staff/123456789012/embed'
  );
  assert.equal(matchLinkEmbed('https://tmblr.co/abc123')?.embedUrl, null);
});

test('embeds are https and lookalike hosts never match', () => {
  const samples = [
    `https://open.spotify.com/track/${spotifyId}`,
    'https://www.instagram.com/p/CabcDEF_123/',
    'https://www.tiktok.com/@scout2015/video/6718335390845095173',
    'https://www.reddit.com/r/aww/comments/abc123/',
    'https://www.facebook.com/zuck/posts/10102577175875681',
    'https://www.threads.net/@zuck/post/Cabc123',
    'https://bsky.app/profile/did:plc:abc123/post/3kabc',
    'https://www.pinterest.com/pin/123456789012345678/',
    'https://www.linkedin.com/feed/update/urn:li:share:7123456789012345678',
    'https://staff.tumblr.com/123456789012',
  ];
  for (const url of samples) {
    const embed = matchLinkEmbed(url)?.embedUrl;
    assert.ok(embed?.startsWith('https://'), url);
  }

  assert.equal(matchLinkEmbed('https://open.spotify.com.evil.com/track/' + spotifyId), null);
  assert.equal(matchLinkEmbed('https://www.youtube.com.evil.com/watch?v=dQw4w9WgXcQ'), null);
  assert.equal(matchLinkEmbed('https://www.instagram.com.evil.com/p/CabcDEF_123/'), null);
  assert.equal(matchLinkEmbed('javascript:alert(1)'), null);
  assert.equal(matchLinkEmbed('ftp://open.spotify.com/track/' + spotifyId), null);
  assert.equal(matchLinkEmbed('https://user:pass@open.spotify.com/track/' + spotifyId), null);
  assert.equal(matchLinkEmbed('not a url'), null);
});

test('Show loads an iframe or post immediately, with no click step', () => {
  const reddit = matchLinkEmbed('https://www.reddit.com/r/aww/comments/abc123/');
  assert.deepEqual(planLinkEmbed(reddit!, 'on'), {
    kind: 'iframe',
    service: 'reddit',
    src: 'https://embed.reddit.com/r/aww/comments/abc123/?embed=true&ref_source=embed&showmore=false',
  });

  const instagram = matchLinkEmbed('https://www.instagram.com/p/CabcDEF_123/');
  assert.equal(planLinkEmbed(instagram!, 'on')?.kind, 'iframe');

  const spotify = matchLinkEmbed(`https://open.spotify.com/track/${spotifyId}`);
  assert.equal(planLinkEmbed(spotify!, 'on')?.kind, 'iframe');

  const x = matchLinkEmbed('https://x.com/lefthanddraft/status/2123406832731656417');
  assert.deepEqual(planLinkEmbed(x!, 'on'), {
    kind: 'x-post',
    service: 'x',
    statusId: '2123406832731656417',
    url: 'https://x.com/lefthanddraft/status/2123406832731656417',
  });

  const mastodon = matchLinkEmbed('https://mastodon.social/@Gargron/109380000000000000');
  assert.deepEqual(planLinkEmbed(mastodon!, 'on'), {
    kind: 'mastodon-post',
    service: 'mastodon',
    apiUrl: 'https://mastodon.social/api/v1/statuses/109380000000000000',
    url: 'https://mastodon.social/@Gargron/109380000000000000',
  });

  // Ask only plans the prompt; Hide plans nothing. A short link keeps a card.
  assert.equal(planLinkEmbed(reddit!, 'ask')?.kind, 'prompt');
  assert.equal(planLinkEmbed(reddit!, 'off'), null);
  assert.equal(planLinkEmbed(matchLinkEmbed('https://t.co/abc123')!, 'on')?.kind, 'card');
});

test('every service has its own mode, with only Spotify on by default', () => {
  const ids = LINK_EMBED_SERVICES.map((service) => service.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.deepEqual(Object.keys(LINK_EMBED_PREFERENCE_KEYS).sort(), [...ids].sort());
  assert.equal(new Set(Object.values(LINK_EMBED_PREFERENCE_KEYS)).size, ids.length);

  assert.equal(DEFAULT_LINK_EMBED_MODE, 'ask');
  assert.equal(resolveLinkEmbedMode(undefined), 'ask');
  assert.equal(resolveLinkEmbedMode('nonsense'), 'ask');
  assert.equal(resolveLinkEmbedMode('on'), 'on');
  assert.equal(resolveLinkEmbedMode('off'), 'off');

  // Spotify is the one service that is visible on first run; everything else asks.
  assert.equal(LINK_EMBED_DEFAULT_MODES.spotify, 'on');
  for (const service of LINK_EMBED_SERVICES) {
    if (service.id !== 'spotify') assert.equal(LINK_EMBED_DEFAULT_MODES[service.id], 'ask');
  }

  // Each service reads its own key; an absent key uses that service's default.
  const stored = { spotifyEmbeds: 'ask', xEmbeds: 'off' };
  assert.equal(resolveServiceLinkEmbedMode('spotify', stored), 'ask');
  assert.equal(resolveServiceLinkEmbedMode('x', stored), 'off');
  assert.equal(resolveServiceLinkEmbedMode('youtube', stored), 'ask');
  assert.equal(resolveServiceLinkEmbedMode('tumblr', stored), 'ask');
  assert.equal(resolveServiceLinkEmbedMode('spotify', {}), 'on');
  assert.equal(resolveServiceLinkEmbedMode('spotify', { spotifyEmbeds: 'bogus' }), 'on');
  assert.equal(resolveServiceLinkEmbedMode('x', { xEmbeds: 'bogus' }), 'ask');
});

test('embeds.now plan: every service but YouTube and Spotify, only where the core can ask', () => {
  const reddit = matchLinkEmbed('https://www.reddit.com/r/aww/comments/abc123/')!;
  const instagram = matchLinkEmbed('https://www.instagram.com/p/CabcDEF_123/')!;
  const x = matchLinkEmbed('https://x.com/lefthanddraft/status/2123406832731656417')!;
  const spotify = matchLinkEmbed(`https://open.spotify.com/track/${spotifyId}`)!;
  const youtube = matchLinkEmbed('https://youtu.be/dQw4w9WgXcQ')!;

  for (const match of [reddit, instagram, x]) {
    assert.deepEqual(planLinkEmbed(match, 'on', { embedsNow: true }), {
      kind: 'embeds-now',
      service: match.service,
      url: match.url,
    });
    assert.equal(planLinkEmbed(match, 'ask', { embedsNow: true })?.kind, 'prompt');
    assert.equal(planLinkEmbed(match, 'off', { embedsNow: true }), null);
  }
  assert.deepEqual(planLinkEmbed(x, 'ask', { embedsNow: true }), {
    kind: 'prompt',
    service: 'x',
    embedsNow: true,
  });

  // the browser build cannot ask embeds.now: today's plans, unchanged
  assert.equal(planLinkEmbed(x, 'on', { embedsNow: false })?.kind, 'x-post');
  assert.equal(planLinkEmbed(x, 'on')?.kind, 'x-post');
  assert.equal(planLinkEmbed(reddit, 'on')?.kind, 'iframe');
  assert.deepEqual(planLinkEmbed(reddit, 'ask'), {
    kind: 'prompt',
    service: 'reddit',
    embedsNow: false,
  });

  // players of their own stay as they are
  assert.equal(isEmbedsNowService('youtube'), false);
  assert.equal(isEmbedsNowService('spotify'), false);
  assert.equal(planLinkEmbed(spotify, 'on', { embedsNow: true })?.kind, 'iframe');
  assert.deepEqual(planLinkEmbed(youtube, 'ask', { embedsNow: true }), {
    kind: 'prompt',
    service: 'youtube',
    embedsNow: false,
  });
  assert.deepEqual(LINK_EMBED_SERVICES.filter((s) => isEmbedsNowService(s.id)).length, 11);
});

test('embeds.now only links (profiles) plan nothing without embeds.now', () => {
  for (const url of [
    'https://x.com/jack',
    'https://www.threads.net/@zuck',
    'https://bsky.app/profile/bsky.app',
  ]) {
    const match = matchLinkEmbed(url)!;
    assert.equal(match.embedsNowOnly, true, url);
    assert.equal(planLinkEmbed(match, 'on'), null, url);
    assert.equal(planLinkEmbed(match, 'ask'), null, url);
    assert.equal(planLinkEmbed(match, 'on', { embedsNow: true })?.kind, 'embeds-now', url);
    assert.equal(planLinkEmbed(match, 'ask', { embedsNow: true })?.kind, 'prompt', url);
  }
});

test('the link shapes embeds.now understands all match their service', () => {
  const expected: Record<string, string> = {
    'https://x.com/jack/status/20': 'x',
    'https://twitter.com/jack/status/20?s=20': 'x',
    'https://mobile.twitter.com/jack/status/20': 'x',
    'https://x.com/jack': 'x',
    'https://twitter.com/jack': 'x',
    'https://t.co/abc123': 'x',
    'https://www.instagram.com/reel/CabcDEF_123/': 'instagram',
    'https://www.instagram.com/mellythesciencegeek/reel/CabcDEF_123/': 'instagram',
    'https://www.instagram.com/someone/p/CabcDEF_123/': 'instagram',
    'https://www.instagram.com/share/reel/BAbCdEfGh/': 'instagram',
    'https://www.instagram.com/share/BAbCdEfGh': 'instagram',
    'https://www.tiktok.com/@sanilarena/video/7709628307104468255': 'tiktok',
    'https://www.tiktok.com/@sanilarena/photo/7709628307104468255': 'tiktok',
    'https://vm.tiktok.com/ZMabc123/': 'tiktok',
    'https://vt.tiktok.com/ZSabc123/': 'tiktok',
    'https://www.tiktok.com/t/ZTabc123/': 'tiktok',
    'https://www.reddit.com/r/aww/comments/abc123/title/': 'reddit',
    'https://old.reddit.com/r/aww/comments/abc123/title/': 'reddit',
    'https://redd.it/abc123': 'reddit',
    'https://www.reddit.com/r/aww/s/AbCdEf1234': 'reddit',
    'https://www.facebook.com/reel/1234567890': 'facebook',
    'https://www.facebook.com/watch/?v=1234567890': 'facebook',
    'https://www.facebook.com/someone/posts/pfbid0abc': 'facebook',
    'https://www.facebook.com/share/p/AbCdEf/': 'facebook',
    'https://www.facebook.com/share/v/AbCdEf/': 'facebook',
    'https://fb.watch/abcDEF/': 'facebook',
    'https://www.threads.net/@zuck/post/C8abcdEFG': 'threads',
    'https://www.threads.com/@zuck/post/C8abcdEFG': 'threads',
    'https://www.threads.net/@zuck': 'threads',
    'https://www.threads.com/t/C8abcdEFG': 'threads',
    'https://bsky.app/profile/bsky.app/post/3kabc': 'bluesky',
    'https://bsky.app/profile/bsky.app': 'bluesky',
    'https://mastodon.social/@Gargron/109380000000000000': 'mastodon',
    'https://fosstodon.org/@user/109380000000000000': 'mastodon',
    'https://www.pinterest.com/pin/1234567890123/': 'pinterest',
    'https://pin.it/abc123': 'pinterest',
    'https://www.linkedin.com/posts/someone_activity-123-abcd': 'linkedin',
    'https://www.linkedin.com/feed/update/urn:li:activity:7012345678901234567/': 'linkedin',
    'https://lnkd.in/abc123': 'linkedin',
    'https://www.tumblr.com/someblog/123456789012': 'tumblr',
    'https://someblog.tumblr.com/post/123456789012/slug': 'tumblr',
  };
  for (const [url, service] of Object.entries(expected)) {
    assert.equal(matchLinkEmbed(url)?.service, service, url);
  }
});

test('lookalike hosts and unusual profile paths are not matched', () => {
  for (const url of [
    'https://x.com.evil.com/jack',
    'https://evilx.com/jack',
    'https://x.com/home',
    'https://x.com/search?q=a',
    'https://x.com/settings',
    'https://x.com/jack/likes',
    'https://threads.net.evil.com/@zuck',
    'https://www.threads.net/@zu%20ck',
    'https://bsky.app.evil.com/profile/bsky.app',
    'https://bsky.app/search?q=a',
    'https://bsky.app/profile/bad handle',
    'https://www.instagram.com/someone/',
    'https://redd.it.evil.com/abc123',
    'https://fb.watch.evil.com/abc',
    'https://vm.tiktok.com.evil.com/abc',
    'https://127.0.0.1/@jack/12345',
  ]) {
    assert.equal(matchLinkEmbed(url), null, url);
  }
});
