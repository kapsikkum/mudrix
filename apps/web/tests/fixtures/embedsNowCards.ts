import type { LinkEmbedCard } from '../../src/core/rpc/api.gen.ts';

/** Cards shaped like real embeds.now answers (core `MudrixClient.linkEmbed`), one per service. */

export const xCard: LinkEmbedCard = {
  service: 'X/Twitter',
  url: 'https://x.com/JesseCohenInv/status/2120962452137431338',
  accent: 1940464,
  blocks: [
    {
      type: 'text',
      markdown:
        '**[Jesse Cohen (@JesseCohenInv)](https://x.com/JesseCohenInv)**\nWhoever made this is a genius\n-# 12 November 2026\n**49K likes · 452 replies**',
      thumbnail: {
        url: 'https://pbs.twimg.com/profile_images/966634456911155201/vsMQLdlR_400x400.jpg',
        kind: 'image',
        description: 'Jesse Cohen',
      },
    },
    {
      type: 'gallery',
      items: [
        {
          url: 'https://video.twimg.com/amplify_video/2120913908546285568/vid/avc1/1280x720/dDo-oiDqr-Bt3WR8.mp4',
          kind: 'video',
          description: null,
        },
      ],
    },
    {
      type: 'buttons',
      buttons: [
        { label: 'Open on X', url: 'https://x.com/JesseCohenInv/status/2120962452137431338' },
      ],
    },
  ],
};

export const instagramCard: LinkEmbedCard = {
  service: 'Instagram',
  url: 'https://www.instagram.com/reel/Df7kllksYsl/',
  accent: 15436852,
  blocks: [
    { type: 'text', markdown: '**@mellythesciencegeek**', thumbnail: null },
    {
      type: 'gallery',
      items: [
        { url: 'https://embeds.now/media/ig/Df7kllksYsl/1.mp4', kind: 'video', description: null },
      ],
    },
    { type: 'separator' },
    {
      type: 'buttons',
      buttons: [{ label: 'Open on Instagram', url: 'https://www.instagram.com/reel/Df7kllksYsl/' }],
    },
  ],
};

export const tiktokCard: LinkEmbedCard = {
  service: 'TikTok',
  url: 'https://www.tiktok.com/@sanilarena/video/7709628307104468255',
  accent: 16657493,
  blocks: [
    {
      type: 'text',
      markdown:
        '**[Vegan Renad (@sanilarena)](https://www.tiktok.com/@sanilarena)**\nThat low budget song will be played everywhere \\#lowbudgetamanda\n-# 18 November 2026\n**27K likes · 558 comments**',
      thumbnail: {
        url: 'https://p16-common-sign.tiktokcdn-eu.com/tos-maliva-avt-0068/avatar.jpeg?dr=10399&x-expires=1795323600',
        kind: 'image',
        description: 'Vegan Renad',
      },
    },
    {
      type: 'gallery',
      items: [
        {
          url: 'https://embeds.now/media/tt/7709628307104468255.mp4',
          kind: 'video',
          description: null,
        },
      ],
    },
  ],
};

const redditImages = [
  'irohaebvxsge1',
  'lnemxebvxsge1',
  '7jnefebvxsge1',
  '0b9pzdbvxsge1',
  'fcvs6ebvxsge1',
  'azsn3fbvxsge1',
  'awqz9ebvxsge1',
  '76nocebvxsge1',
  'erfx3fbvxsge1',
  'psbl4fbvxsge1',
  'extra1',
  'extra2',
];

export const redditCard: LinkEmbedCard = {
  service: 'Reddit',
  url: 'https://www.reddit.com/r/steinsgate/comments/1ig9m0c/steinsgate_pilgrimage_akihabara/',
  accent: 16729344,
  blocks: [
    {
      type: 'text',
      markdown:
        '**[Steins;Gate Pilgrimage - Akihabara](https://www.reddit.com/r/steinsgate/comments/1ig9m0c/steinsgate_pilgrimage_akihabara/)**\nEl Psy Kongroo!\n-# r/steinsgate · u/DaniyalRaider\n-# Showing 10 of 19\n**963 upvotes · 49 comments**',
      thumbnail: null,
    },
    {
      type: 'gallery',
      items: redditImages.map((id) => ({
        url: `https://i.redd.it/${id}.jpg`,
        kind: 'image' as const,
        description: null,
      })),
    },
    { type: 'separator' },
    {
      type: 'buttons',
      buttons: [
        {
          label: 'Open on Reddit',
          url: 'https://www.reddit.com/r/steinsgate/comments/1ig9m0c/steinsgate_pilgrimage_akihabara/',
        },
      ],
    },
  ],
};

export const blueskyCard: LinkEmbedCard = {
  service: 'Bluesky',
  url: 'https://bsky.app/profile/tapenori.bsky.social/post/3n2bm4iim3kqh',
  accent: 1148414,
  blocks: [
    {
      type: 'text',
      markdown:
        '**[tapenori (@tapenori.bsky.social)](https://bsky.app/profile/tapenori.bsky.social)**\nhello\n-# 14 November 2026\n**49 likes · 3 reposts**',
      thumbnail: {
        url: 'https://cdn.bsky.app/img/avatar/plain/did:plc:4g4mvvcaejkrendcktu5446h/bafkreid3pfs4jt66rbged7tkuofld23he7aozovzwmiuiccvcfbfihbrpi',
        kind: 'image',
        description: 'tapenori',
      },
    },
    {
      type: 'gallery',
      items: [
        {
          url: 'https://cdn.bsky.app/img/feed_fullsize/plain/did:plc:4g4mvvcaejkrendcktu5446h/bafkreid24f7plogyaneqgzhbj7zwk7wpucbfyqon3oexcw5xgdvfgdon6u',
          kind: 'image',
          description: 'A photo',
        },
      ],
    },
  ],
};

export const audioCard: LinkEmbedCard = {
  service: 'Example',
  url: 'https://example.com/track',
  accent: null,
  blocks: [
    { type: 'text', markdown: 'A track', thumbnail: null },
    {
      type: 'gallery',
      items: [{ url: 'https://embeds.now/media/track.mp3', kind: 'audio', description: null }],
    },
  ],
};

/** Everything an untrusted card could try. */
export const hostileCard: LinkEmbedCard = {
  service: 'Evil',
  url: 'javascript:alert(1)',
  accent: 0x1000000,
  blocks: [
    {
      type: 'text',
      markdown:
        '<img src=x onerror=alert(1)> **[click](javascript:alert(1))** [data](data:text/html;base64,AAAA) [plain](http://example.com/a) [ok](https://example.com/ok)',
      thumbnail: { url: 'http://pbs.twimg.com/a.jpg', kind: 'image', description: null },
    },
    {
      type: 'gallery',
      items: [
        { url: 'javascript:alert(1)', kind: 'image', description: null },
        { url: 'https://127.0.0.1/a.jpg', kind: 'image', description: null },
        { url: 'https://user:pw@pbs.twimg.com/a.jpg', kind: 'image', description: null },
        { url: 'https://pbs.twimg.com:8443/a.jpg', kind: 'image', description: null },
        { url: 'https://localhost/a.jpg', kind: 'image', description: null },
        { url: 'https://pbs.twimg.com/ok.jpg', kind: 'image', description: '<b>x</b>' },
        { url: 'https://pbs.twimg.com/weird.jpg', kind: 'script' as 'image', description: null },
      ],
    },
    {
      type: 'buttons',
      buttons: [
        { label: 'Bad', url: 'javascript:alert(1)' },
        { label: '', url: 'https://example.com/' },
        { label: 'Good', url: 'https://example.com/good' },
      ],
    },
    { type: 'iframe' } as unknown as LinkEmbedCard['blocks'][number],
  ],
};
