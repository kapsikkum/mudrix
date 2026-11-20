import { isForbiddenHost } from './integrationFetch';
import { parseYouTubeUrl } from './youtube';

/** A service whose normal links become a card or an official embed in the timeline. */
export type LinkEmbedServiceId =
  | 'youtube'
  | 'spotify'
  | 'x'
  | 'instagram'
  | 'tiktok'
  | 'reddit'
  | 'facebook'
  | 'threads'
  | 'bluesky'
  | 'mastodon'
  | 'pinterest'
  | 'linkedin'
  | 'tumblr';

/** Asked once, then shown, or hidden (the link falls back to a plain preview). */
export type LinkEmbedMode = 'ask' | 'on' | 'off';

export const DEFAULT_LINK_EMBED_MODE: LinkEmbedMode = 'ask';

/** The first-run choice per service; Spotify players are the one that start visible. */
export const LINK_EMBED_DEFAULT_MODES = {
  youtube: 'ask',
  spotify: 'on',
  x: 'ask',
  instagram: 'ask',
  tiktok: 'ask',
  reddit: 'ask',
  facebook: 'ask',
  threads: 'ask',
  bluesky: 'ask',
  mastodon: 'ask',
  pinterest: 'ask',
  linkedin: 'ask',
  tumblr: 'ask',
} as const satisfies Record<LinkEmbedServiceId, LinkEmbedMode>;

/** Folds anything unexpected back to the fallback, so a bad synced value can never enable an embed. */
export function resolveLinkEmbedMode(
  value: unknown,
  fallback: LinkEmbedMode = DEFAULT_LINK_EMBED_MODE
): LinkEmbedMode {
  return value === 'ask' || value === 'on' || value === 'off' ? value : fallback;
}

/** Reads one service's mode from stored preferences; a missing or bad value uses its default. */
export function resolveServiceLinkEmbedMode(
  service: LinkEmbedServiceId,
  preferences: Readonly<Record<string, unknown>>
): LinkEmbedMode {
  return resolveLinkEmbedMode(
    preferences[LINK_EMBED_PREFERENCE_KEYS[service]],
    LINK_EMBED_DEFAULT_MODES[service]
  );
}

/** The preference that stores each service's mode; YouTube keeps its original key. */
export const LINK_EMBED_PREFERENCE_KEYS = {
  youtube: 'youtubeEmbeds',
  spotify: 'spotifyEmbeds',
  x: 'xEmbeds',
  instagram: 'instagramEmbeds',
  tiktok: 'tiktokEmbeds',
  reddit: 'redditEmbeds',
  facebook: 'facebookEmbeds',
  threads: 'threadsEmbeds',
  bluesky: 'blueskyEmbeds',
  mastodon: 'mastodonEmbeds',
  pinterest: 'pinterestEmbeds',
  linkedin: 'linkedinEmbeds',
  tumblr: 'tumblrEmbeds',
} as const satisfies Record<LinkEmbedServiceId, string>;

/** Where the card may ask for a title, author and picture once the person has allowed it. */
export interface LinkEmbedMetadataSource {
  kind: 'oembed' | 'mastodon';
  url: string;
  /** Exact hosts this request (and any redirect) may reach. */
  allow: readonly string[];
}

export interface LinkEmbedResolveSource {
  kind: 'bluesky';
  url: string;
  /** Exact hosts this request (and any redirect) may reach. */
  allow: readonly string[];
  rkey: string;
}

export interface LinkEmbedMatch {
  service: LinkEmbedServiceId;
  /** The link to open in a browser, normalised to https and with no fragment. */
  url: string;
  /** Official player address (https), or null when the service has no safe iframe. */
  embedUrl: string | null;
  /** A DID lookup that turns a handle link into the official embed address. */
  resolve?: LinkEmbedResolveSource;
  /** YouTube is drawn by its own component; the registry only recognises it. */
  existing?: boolean;
  /**
   * The link's shape is only understood by embeds.now (a profile, a newer URL form). Where it
   * cannot be used the link stays a plain preview instead of asking about a card that cannot load.
   */
  embedsNowOnly?: boolean;
  /** Facts that come from the URL itself, shown before any third party is asked. */
  author?: string;
  /** X/Twitter status id, used by the dedicated post card. */
  xStatusId?: string;
  /** Size of the player box, in CSS pixels; the card never grows past its column. */
  player?: { width: number; height: number };
  /** Iframe permissions for this player only. */
  iframeAllow?: string;
  metadata?: LinkEmbedMetadataSource;
}

/** What a link renders when the person has allowed the service. Nothing here waits for a click. */
export type LinkEmbedPlan =
  | { kind: 'prompt'; service: LinkEmbedServiceId; embedsNow: boolean }
  | { kind: 'iframe'; service: LinkEmbedServiceId; src: string }
  | { kind: 'x-post'; service: LinkEmbedServiceId; statusId: string; url: string }
  | { kind: 'mastodon-post'; service: LinkEmbedServiceId; apiUrl: string; url: string }
  | { kind: 'embeds-now'; service: LinkEmbedServiceId; url: string }
  | { kind: 'card'; service: LinkEmbedServiceId; url: string };

/** YouTube and Spotify keep their own players; every other service can be an embeds.now card. */
export function isEmbedsNowService(service: LinkEmbedServiceId): boolean {
  return service !== 'youtube' && service !== 'spotify';
}

export interface PlanLinkEmbedOptions {
  /** The app can ask embeds.now through its core (the native desktop build, not the browser). */
  embedsNow?: boolean;
}

/**
 * Turns a link and its setting into what the timeline shows. `on` is consent: the iframe, post
 * or embeds.now card is loaded immediately, encrypted room or not. `ask` is only a prompt, `off`
 * is nothing.
 */
export function planLinkEmbed(
  match: LinkEmbedMatch,
  mode: LinkEmbedMode,
  options: PlanLinkEmbedOptions = {}
): LinkEmbedPlan | null {
  if (mode === 'off') return null;
  const embedsNow = !!options.embedsNow && isEmbedsNowService(match.service);
  if (match.embedsNowOnly && !embedsNow) return null;
  if (mode === 'ask') return { kind: 'prompt', service: match.service, embedsNow };
  if (embedsNow) return { kind: 'embeds-now', service: match.service, url: match.url };
  if (match.service === 'x' && match.xStatusId) {
    return {
      kind: 'x-post',
      service: match.service,
      statusId: match.xStatusId,
      url: match.url,
    };
  }
  if (match.service === 'mastodon' && match.metadata?.kind === 'mastodon') {
    return {
      kind: 'mastodon-post',
      service: match.service,
      apiUrl: match.metadata.url,
      url: match.url,
    };
  }
  if (match.embedUrl) return { kind: 'iframe', service: match.service, src: match.embedUrl };
  return { kind: 'card', service: match.service, url: match.url };
}

type ServiceResult = Omit<LinkEmbedMatch, 'service'> & { service?: never };

export interface LinkEmbedService {
  id: LinkEmbedServiceId;
  label: string;
  /** Colour of the card's left edge; the service's own brand colour. */
  accent: string;
  /** Host shapes the parser accepts, for documentation and tests. */
  hosts: readonly string[];
  parse: (url: URL) => ServiceResult | null;
}

const MAX_URL_LENGTH = 2000;

/** Parses a pasted link, allowing http links to be upgraded but never credentials or odd ports. */
function readUrl(raw: string): URL | null {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > MAX_URL_LENGTH) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  if (url.username || url.password || url.port) return null;
  const host = url.hostname.toLowerCase();
  if (isForbiddenHost(host)) return null;
  url.protocol = 'https:';
  url.hash = '';
  return url;
}

/** Path segments, decoded once, so an encoded slash cannot be mistaken for structure. */
function pathParts(url: URL): string[] {
  return url.pathname
    .split('/')
    .filter(Boolean)
    .map((part) => {
      try {
        return decodeURIComponent(part);
      } catch {
        return part;
      }
    });
}

function hasHost(url: URL, hosts: readonly string[]): boolean {
  return hosts.includes(url.hostname.toLowerCase());
}

function normalizedHref(url: URL): string {
  const clean = new URL(url.href);
  clean.protocol = 'https:';
  clean.hash = '';
  return clean.href;
}

function card(url: URL, author?: string): ServiceResult {
  return { url: normalizedHref(url), embedUrl: null, author };
}

/** A profile or account page: only embeds.now draws it, so nothing is asked without it. */
function profileCard(url: URL, canonical: string, author: string): ServiceResult {
  return { url: canonical || normalizedHref(url), embedsNowOnly: true, embedUrl: null, author };
}

function oembed(url: string, allow: readonly string[]): LinkEmbedMetadataSource {
  return { kind: 'oembed', url, allow };
}

function spotify(url: URL): ServiceResult | null {
  const host = url.hostname.toLowerCase();
  if (host === 'spotify.link' || host === 'spotify.app.link') return card(url);
  if (!hasHost(url, ['open.spotify.com', 'play.spotify.com'])) return null;

  const parts = pathParts(url);
  if (parts[0] && /^intl-[a-z]{2,5}$/i.test(parts[0])) parts.shift();
  if (parts[0] === 'embed') parts.shift();
  const [type, id] = parts;
  if (!type || !['track', 'album', 'playlist', 'episode', 'show', 'artist'].includes(type)) {
    return null;
  }
  if (!id || !/^[A-Za-z0-9]{22}$/.test(id)) return null;

  const canonical = `https://open.spotify.com/${type}/${id}`;
  return {
    url: canonical,
    embedUrl: `https://open.spotify.com/embed/${type}/${id}`,
    player: { width: 520, height: type === 'track' || type === 'episode' ? 152 : 352 },
    iframeAllow: 'autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture',
    metadata: oembed(`https://open.spotify.com/oembed?url=${encodeURIComponent(canonical)}`, [
      'open.spotify.com',
    ]),
  };
}

const X_HOSTS = [
  'x.com',
  'www.x.com',
  'twitter.com',
  'www.twitter.com',
  'mobile.twitter.com',
  'm.twitter.com',
] as const;

const X_RESERVED_PATHS = new Set([
  'home',
  'explore',
  'search',
  'notifications',
  'messages',
  'settings',
  'i',
  'intent',
  'share',
  'login',
  'logout',
  'signup',
  'compose',
  'tos',
  'privacy',
  'about',
  'hashtag',
  'jobs',
  'download',
  'account',
  'lists',
  'topics',
  'communities',
]);

function isXHandle(value: string | undefined): value is string {
  return !!value && /^[A-Za-z0-9_]{1,15}$/.test(value);
}

function xPost(url: URL): ServiceResult | null {
  if (url.hostname.toLowerCase() === 't.co') return card(url);
  if (!hasHost(url, X_HOSTS)) return null;

  const parts = pathParts(url);
  let user: string | undefined;
  let id: string | undefined;
  if (parts[0] === 'i' && parts[1] === 'web' && parts[2] === 'status') id = parts[3];
  else if (parts[0] === 'i' && parts[1] === 'status') id = parts[2];
  else if (parts[1] === 'status' || parts[1] === 'statuses') {
    user = parts[0];
    id = parts[2];
  }
  if (
    !id &&
    parts.length === 1 &&
    isXHandle(parts[0]) &&
    !X_RESERVED_PATHS.has(parts[0].toLowerCase())
  ) {
    return profileCard(url, `https://x.com/${parts[0]}`, `@${parts[0]}`);
  }
  if (!id || !/^\d{1,25}$/.test(id)) return null;
  if (user && !isXHandle(user)) return null;

  return {
    url: user ? `https://x.com/${user}/status/${id}` : `https://x.com/i/status/${id}`,
    embedUrl: null,
    author: user ? `@${user}` : undefined,
    xStatusId: id,
  };
}

const INSTAGRAM_HOSTS = [
  'instagram.com',
  'www.instagram.com',
  'm.instagram.com',
  'instagr.am',
  'www.instagr.am',
] as const;

function instagram(url: URL): ServiceResult | null {
  if (!hasHost(url, INSTAGRAM_HOSTS)) return null;
  const parts = pathParts(url);
  // `/<user>/p/<code>` and `/<user>/reel/<code>` are the same posts with the author in front.
  if (
    parts.length >= 3 &&
    /^[A-Za-z0-9._]{1,30}$/.test(parts[0]) &&
    ['p', 'reel'].includes(parts[1])
  ) {
    parts.shift();
  }
  const [kind, code] = parts;
  if (kind === 'share') return card(url);
  if (!kind || !['p', 'reel', 'reels', 'tv'].includes(kind)) return null;
  if (!code || !/^[A-Za-z0-9_-]{5,30}$/.test(code)) return null;

  const embedKind = kind === 'p' || kind === 'tv' ? 'p' : 'reel';
  const canonical = `https://www.instagram.com/${embedKind}/${code}/`;
  return {
    url: canonical,
    embedUrl: `https://www.instagram.com/${embedKind}/${code}/embed/`,
    player: { width: 400, height: 560 },
    iframeAllow: 'autoplay; encrypted-media; picture-in-picture',
  };
}

function tiktok(url: URL): ServiceResult | null {
  const host = url.hostname.toLowerCase();
  if (host === 'vt.tiktok.com' || host === 'vm.tiktok.com') return card(url);
  if (!hasHost(url, ['tiktok.com', 'www.tiktok.com', 'm.tiktok.com'])) return null;

  const parts = pathParts(url);
  if (parts[0] === 't') return card(url);
  let user: string | undefined;
  let id: string | undefined;
  if (parts[0] === 'embed' && parts[1] === 'v2') id = parts[2];
  else if (parts[0] === 'v') id = parts[1]?.replace(/\.html$/i, '');
  else if (parts[0]?.startsWith('@') && (parts[1] === 'video' || parts[1] === 'photo')) {
    user = parts[0].slice(1);
    id = parts[2];
  }
  if (!id || !/^\d{6,25}$/.test(id)) return null;
  if (user && !/^[A-Za-z0-9._-]{1,64}$/.test(user)) return null;

  const canonical = user ? `https://www.tiktok.com/@${user}/video/${id}` : normalizedHref(url);
  return {
    url: canonical,
    embedUrl: `https://www.tiktok.com/embed/v2/${id}`,
    author: user ? `@${user}` : undefined,
    player: { width: 325, height: 575 },
    iframeAllow: 'autoplay; encrypted-media; fullscreen; picture-in-picture',
    metadata: oembed(`https://www.tiktok.com/oembed?url=${encodeURIComponent(canonical)}`, [
      'www.tiktok.com',
    ]),
  };
}

const REDDIT_HOSTS = [
  'reddit.com',
  'www.reddit.com',
  'old.reddit.com',
  'm.reddit.com',
  'new.reddit.com',
] as const;

function reddit(url: URL): ServiceResult | null {
  const host = url.hostname.toLowerCase();
  if (host === 'redd.it' || host === 'www.redd.it') return card(url);
  if (!hasHost(url, REDDIT_HOSTS)) return null;

  const parts = pathParts(url);
  if (parts[0] === 'r' && parts[2] === 's') return card(url);
  let sub: string | undefined;
  let id: string | undefined;
  if (parts[0] === 'r' && parts[2] === 'comments') {
    sub = parts[1];
    id = parts[3];
  } else if (parts[0] === 'comments') {
    id = parts[1];
  }
  if (!id || !/^[a-z0-9]{4,12}$/i.test(id)) return null;
  if (!sub) return card(url);
  if (!/^[A-Za-z0-9_]{2,32}$/.test(sub)) return null;
  const slug = parts[4] && /^[A-Za-z0-9_-]{1,120}$/.test(parts[4]) ? `${parts[4]}/` : '';

  const canonical = `https://www.reddit.com/r/${sub}/comments/${id}/${slug}`;
  return {
    url: canonical,
    embedUrl: `https://embed.reddit.com/r/${sub}/comments/${id}/?embed=true&ref_source=embed&showmore=false`,
    author: `r/${sub}`,
    player: { width: 432, height: 620 },
    iframeAllow: 'autoplay; encrypted-media; fullscreen; picture-in-picture',
    metadata: oembed(`https://www.reddit.com/oembed?url=${encodeURIComponent(canonical)}`, [
      'www.reddit.com',
    ]),
  };
}

const FACEBOOK_HOSTS = [
  'facebook.com',
  'www.facebook.com',
  'm.facebook.com',
  'web.facebook.com',
  'mbasic.facebook.com',
] as const;

const FACEBOOK_SAFE = /^[A-Za-z0-9._-]{1,100}$/;

function facebook(url: URL): ServiceResult | null {
  const host = url.hostname.toLowerCase();
  if (host === 'fb.watch' || host === 'fb.me') return card(url);
  if (!hasHost(url, FACEBOOK_HOSTS)) return null;

  const parts = pathParts(url);
  let href: string | undefined;
  let video = false;

  if (parts[0] === 'watch') {
    const id = url.searchParams.get('v');
    if (id && FACEBOOK_SAFE.test(id)) href = `https://www.facebook.com/watch/?v=${id}`;
    video = true;
  } else if (parts[0] === 'reel' && parts[1] && FACEBOOK_SAFE.test(parts[1])) {
    href = `https://www.facebook.com/reel/${parts[1]}`;
    video = true;
  } else if (parts[0] === 'videos' && parts[1] && FACEBOOK_SAFE.test(parts[1])) {
    href = normalizedHref(url);
    video = true;
  } else if (parts[0] === 'posts' && parts[1] && FACEBOOK_SAFE.test(parts[1])) {
    href = `https://www.facebook.com/posts/${parts[1]}`;
  } else if (
    parts[1] === 'posts' &&
    parts[0] &&
    FACEBOOK_SAFE.test(parts[0]) &&
    parts[2] &&
    FACEBOOK_SAFE.test(parts[2])
  ) {
    href = `https://www.facebook.com/${parts[0]}/posts/${parts[2]}`;
  } else if (parts[0] === 'permalink.php' || parts[0] === 'story.php') {
    const story = url.searchParams.get('story_fbid');
    const owner = url.searchParams.get('id');
    if (story && owner && FACEBOOK_SAFE.test(story) && FACEBOOK_SAFE.test(owner)) {
      href = `https://www.facebook.com/${parts[0]}?story_fbid=${story}&id=${owner}`;
    }
  } else if (parts[0] === 'photo.php') {
    const photo = url.searchParams.get('fbid');
    if (photo && FACEBOOK_SAFE.test(photo)) {
      href = `https://www.facebook.com/photo.php?fbid=${photo}`;
    }
  } else if (parts[0] === 'share') {
    return card(url);
  }
  if (!href) return null;

  return {
    url: href,
    embedUrl: `https://www.facebook.com/plugins/${video ? 'video' : 'post'}.php?href=${encodeURIComponent(
      href
    )}&show_text=${video ? 'false' : 'true'}&width=400`,
    player: video ? { width: 500, height: 400 } : { width: 500, height: 600 },
    iframeAllow: 'autoplay; clipboard-write; encrypted-media; picture-in-picture; web-share',
  };
}

const THREADS_HOSTS = ['threads.net', 'www.threads.net', 'threads.com', 'www.threads.com'] as const;

function threads(url: URL): ServiceResult | null {
  if (!hasHost(url, THREADS_HOSTS)) return null;
  const parts = pathParts(url);
  if (parts[0] === 't') return card(url);
  const handle = parts[0];
  if (!handle?.startsWith('@')) return null;
  if (parts.length === 1) {
    if (!/^[A-Za-z0-9._-]{1,64}$/.test(handle.slice(1))) return null;
    return profileCard(url, `https://www.threads.net/${handle}`, handle);
  }
  if (parts[1] !== 'post') return null;
  const user = handle.slice(1);
  const id = parts[2];
  if (!/^[A-Za-z0-9._-]{1,64}$/.test(user)) return null;
  if (!id || !/^[A-Za-z0-9_-]{1,64}$/.test(id)) return null;

  const canonical = `https://www.threads.net/@${user}/post/${id}`;
  return {
    url: canonical,
    embedUrl: `${canonical}/embed`,
    author: `@${user}`,
    player: { width: 400, height: 600 },
    iframeAllow: 'autoplay; encrypted-media; picture-in-picture',
  };
}

function bluesky(url: URL): ServiceResult | null {
  if (!hasHost(url, ['bsky.app', 'www.bsky.app'])) return null;
  const parts = pathParts(url);
  if (parts[0] !== 'profile') return null;
  if (parts.length === 2) {
    if (
      !/^[A-Za-z0-9.-]{1,253}$/.test(parts[1]) &&
      !/^did:[a-z]+:[A-Za-z0-9._:%-]+$/.test(parts[1])
    ) {
      return null;
    }
    return profileCard(url, `https://bsky.app/profile/${parts[1]}`, `@${parts[1]}`);
  }
  if (parts[2] !== 'post') return null;
  const handle = parts[1];
  const rkey = parts[3];
  if (!handle || !rkey || !/^[A-Za-z0-9._~-]{1,512}$/.test(rkey)) return null;

  const canonical = `https://bsky.app/profile/${handle}/post/${rkey}`;
  if (/^did:[a-z]+:[A-Za-z0-9._:%-]+$/.test(handle)) {
    return {
      url: canonical,
      embedUrl: `https://embed.bsky.app/embed/${handle}/app.bsky.feed.post/${rkey}`,
      player: { width: 400, height: 500 },
      iframeAllow: 'autoplay; encrypted-media; picture-in-picture',
      metadata: oembed(`https://embed.bsky.app/oembed?url=${encodeURIComponent(canonical)}`, [
        'embed.bsky.app',
      ]),
    };
  }
  if (!/^[A-Za-z0-9.-]{1,253}$/.test(handle)) return null;
  return {
    url: canonical,
    embedUrl: null,
    resolve: {
      kind: 'bluesky',
      url: `https://public.api.bsky.app/xrpc/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(
        handle
      )}`,
      allow: ['public.api.bsky.app'],
      rkey,
    },
    metadata: oembed(`https://embed.bsky.app/oembed?url=${encodeURIComponent(canonical)}`, [
      'embed.bsky.app',
    ]),
  };
}

const OWNED_HOSTS = new Set<string>([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'youtu.be',
  'youtube-nocookie.com',
  'www.youtube-nocookie.com',
  'open.spotify.com',
  'play.spotify.com',
  'spotify.link',
  'spotify.app.link',
  ...X_HOSTS,
  't.co',
  ...INSTAGRAM_HOSTS,
  'tiktok.com',
  'www.tiktok.com',
  'm.tiktok.com',
  'vt.tiktok.com',
  'vm.tiktok.com',
  ...REDDIT_HOSTS,
  'redd.it',
  'www.redd.it',
  ...FACEBOOK_HOSTS,
  'fb.watch',
  'fb.me',
  ...THREADS_HOSTS,
  'bsky.app',
  'www.bsky.app',
  'pinterest.com',
  'www.pinterest.com',
  'm.pinterest.com',
  'pin.it',
  'linkedin.com',
  'www.linkedin.com',
  'm.linkedin.com',
  'lnkd.in',
  'www.lnkd.in',
  'tumblr.com',
  'www.tumblr.com',
  'tmblr.co',
  'www.tmblr.co',
]);

function isOwnedHost(host: string): boolean {
  if (OWNED_HOSTS.has(host)) return true;
  if (/^[a-z]{2,5}\.pinterest\.com$/.test(host)) return true;
  return /^[a-z0-9-]+\.tumblr\.com$/.test(host);
}

/**
 * Mastodon has no fixed host list: every instance has its own name. The shape is distinctive
 * enough (`/@user/123…` or `/users/user/statuses/123…`), and known service hosts are excluded
 * so a normal site's `/@team/1234` link is not mistaken for a status.
 */
function mastodon(url: URL): ServiceResult | null {
  const host = url.hostname.toLowerCase();
  if (isOwnedHost(host)) return null;

  const parts = pathParts(url);
  if (parts[0] === 'web' && parts[1]?.startsWith('@')) parts.shift();
  let user: string | undefined;
  let id: string | undefined;
  if (parts[0]?.startsWith('@')) {
    user = parts[0].slice(1);
    id = parts[1];
  } else if (parts[0] === 'users' && parts[2] === 'statuses') {
    user = parts[1];
    id = parts[3];
  }
  if (!id || !/^\d{4,32}$/.test(id)) return null;
  if (user && !/^[A-Za-z0-9_.-]+(@[A-Za-z0-9.-]+)?$/.test(user)) return null;

  const author = user ? `@${user.includes('@') ? user : `${user}@${host}`}` : undefined;
  return {
    url: normalizedHref(url),
    embedUrl: null,
    author,
    metadata: {
      kind: 'mastodon',
      url: `https://${host}/api/v1/statuses/${id}`,
      allow: [host],
    },
  };
}

function pinterest(url: URL): ServiceResult | null {
  const host = url.hostname.toLowerCase();
  if (host === 'pin.it') return card(url);
  const localised = /^[a-z]{2,5}\.pinterest\.com$/.test(host) && host !== 'www.pinterest.com';
  if (!hasHost(url, ['pinterest.com', 'www.pinterest.com', 'm.pinterest.com']) && !localised) {
    return null;
  }

  const parts = pathParts(url);
  if (parts[0] !== 'pin' || !parts[1] || !/^\d{4,30}$/.test(parts[1])) return null;
  const canonical = `https://www.pinterest.com/pin/${parts[1]}/`;
  return {
    url: canonical,
    embedUrl: `https://assets.pinterest.com/ext/embed.html?id=${parts[1]}`,
    player: { width: 345, height: 420 },
    iframeAllow: 'autoplay; encrypted-media',
    metadata: oembed(`https://www.pinterest.com/oembed.json?url=${encodeURIComponent(canonical)}`, [
      'www.pinterest.com',
    ]),
  };
}

function linkedin(url: URL): ServiceResult | null {
  const host = url.hostname.toLowerCase();
  if (host === 'lnkd.in' || host === 'www.lnkd.in') return card(url);
  if (!hasHost(url, ['linkedin.com', 'www.linkedin.com', 'm.linkedin.com'])) return null;

  const parts = pathParts(url);
  if (parts[0] === 'feed' && parts[1] === 'update' && parts[2]) {
    const urn = /^urn:li:(activity|share|ugcPost):(\d{1,30})$/.exec(parts[2]);
    if (!urn) return null;
    return {
      url: `https://www.linkedin.com/feed/update/${parts[2]}/`,
      embedUrl: `https://www.linkedin.com/embed/feed/update/urn:li:${urn[1]}:${urn[2]}`,
      player: { width: 500, height: 540 },
      iframeAllow: 'autoplay; encrypted-media',
    };
  }
  if (parts[0] === 'posts' || parts[0] === 'pulse') return card(url);
  return null;
}

function tumblr(url: URL): ServiceResult | null {
  const host = url.hostname.toLowerCase();
  if (host === 'tmblr.co' || host === 'www.tmblr.co') return card(url);

  const parts = pathParts(url);
  let blog: string | undefined;
  let id: string | undefined;
  if (host === 'tumblr.com' || host === 'www.tumblr.com') {
    if (!parts[0] || !/^[A-Za-z0-9-]{1,64}$/.test(parts[0])) return null;
    blog = parts[0];
    if (parts[1] === 'post') id = parts[2];
    else id = parts[1];
  } else if (/^[a-z0-9-]+\.tumblr\.com$/.test(host) && host !== 'www.tumblr.com') {
    blog = host.slice(0, -'.tumblr.com'.length);
    if (parts[0] === 'post') id = parts[1];
    else id = parts[0];
  } else {
    return null;
  }
  if (!id || !/^\d{4,30}$/.test(id)) return null;

  return {
    url: `https://www.tumblr.com/${blog}/${id}`,
    embedUrl: `https://www.tumblr.com/${blog}/${id}/embed`,
    player: { width: 400, height: 520 },
    iframeAllow: 'autoplay; encrypted-media; fullscreen',
    metadata: oembed(
      `https://www.tumblr.com/oembed/1.0?url=${encodeURIComponent(
        `https://${blog}.tumblr.com/post/${id}`
      )}`,
      ['www.tumblr.com']
    ),
  };
}

/** YouTube keeps its own player; this recognises the link for settings and tests only. */
function youtube(url: URL): ServiceResult | null {
  const video = parseYouTubeUrl(url.href);
  if (!video) return null;
  return {
    url: `https://www.youtube.com/watch?v=${video.id}${video.start > 0 ? `&t=${video.start}` : ''}`,
    embedUrl: null,
    existing: true,
  };
}

export const LINK_EMBED_SERVICES: readonly LinkEmbedService[] = [
  {
    id: 'youtube',
    label: 'YouTube',
    accent: '#ff0000',
    hosts: ['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be', 'youtube-nocookie.com'],
    parse: youtube,
  },
  {
    id: 'spotify',
    label: 'Spotify',
    accent: '#1db954',
    hosts: [
      'open.spotify.com',
      'play.spotify.com',
      'spotify.link',
      'spotify.app.link',
      'open.spotify.com/intl-xx/...',
    ],
    parse: spotify,
  },
  {
    id: 'x',
    label: 'X',
    accent: '#1d9bf0',
    hosts: ['x.com', 'twitter.com', 'mobile.twitter.com', 't.co'],
    parse: xPost,
  },
  {
    id: 'instagram',
    label: 'Instagram',
    accent: '#e1306c',
    hosts: ['instagram.com', 'm.instagram.com', 'instagr.am'],
    parse: instagram,
  },
  {
    id: 'tiktok',
    label: 'TikTok',
    accent: '#25f4ee',
    hosts: ['tiktok.com', 'm.tiktok.com', 'vt.tiktok.com', 'vm.tiktok.com'],
    parse: tiktok,
  },
  {
    id: 'reddit',
    label: 'Reddit',
    accent: '#ff4500',
    hosts: ['reddit.com', 'old.reddit.com', 'm.reddit.com', 'redd.it'],
    parse: reddit,
  },
  {
    id: 'facebook',
    label: 'Facebook',
    accent: '#1877f2',
    hosts: ['facebook.com', 'm.facebook.com', 'web.facebook.com', 'fb.watch', 'fb.me'],
    parse: facebook,
  },
  {
    id: 'threads',
    label: 'Threads',
    accent: '#000000',
    hosts: ['threads.net', 'threads.com'],
    parse: threads,
  },
  {
    id: 'bluesky',
    label: 'Bluesky',
    accent: '#1185fe',
    hosts: ['bsky.app'],
    parse: bluesky,
  },
  {
    id: 'mastodon',
    label: 'Mastodon',
    accent: '#6364ff',
    hosts: ['any instance: /@user/<status>', 'any instance: /users/<user>/statuses/<status>'],
    parse: mastodon,
  },
  {
    id: 'pinterest',
    label: 'Pinterest',
    accent: '#e60023',
    hosts: ['pinterest.com', 'xx.pinterest.com', 'pin.it'],
    parse: pinterest,
  },
  {
    id: 'linkedin',
    label: 'LinkedIn',
    accent: '#0a66c2',
    hosts: ['linkedin.com', 'lnkd.in'],
    parse: linkedin,
  },
  {
    id: 'tumblr',
    label: 'Tumblr',
    accent: '#36465d',
    hosts: ['tumblr.com', '<blog>.tumblr.com', 'tmblr.co'],
    parse: tumblr,
  },
];

export const LINK_EMBED_SERVICE_BY_ID: Record<LinkEmbedServiceId, LinkEmbedService> =
  Object.fromEntries(LINK_EMBED_SERVICES.map((service) => [service.id, service])) as Record<
    LinkEmbedServiceId,
    LinkEmbedService
  >;

/**
 * The first service that recognises this link. YouTube is matched too, but the timeline gives it
 * to `YouTubeEmbed` before asking the registry for anything else.
 */
export function matchLinkEmbed(raw: string): LinkEmbedMatch | null {
  const url = readUrl(raw);
  if (!url) return null;
  for (const service of LINK_EMBED_SERVICES) {
    const result = service.parse(url);
    if (result) return { service: service.id, ...result };
  }
  return null;
}
