/** A single X/Twitter post, as much as a card needs and nothing more. */
export interface XPostPhoto {
  url: string;
  width?: number;
  height?: number;
}

export interface XPostVideo {
  thumbnailUrl: string;
  /** The direct video file when fxtwitter gives one; otherwise the card links to the post. */
  url?: string;
}

export interface XPost {
  id: string;
  text: string;
  authorName: string;
  /** Screen name without the leading @. */
  handle: string;
  avatarUrl?: string;
  verified: boolean;
  createdAt?: string;
  likes: number;
  replies: number;
  retweets: number;
  photos: XPostPhoto[];
  video?: XPostVideo;
}

export interface XPostResult {
  post: XPost;
  via: 'fxtwitter' | 'oembed';
}

function isHttps(value: unknown): value is string {
  if (typeof value !== 'string' || !value.startsWith('https://')) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password;
  } catch {
    return false;
  }
}

function count(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.replace(/\r\n/g, '\n') : '';
}

/** fxtwitter keeps the t.co link to attached media in the text; the media grid replaces it. */
function stripMediaTrailer(body: string, hasMedia: boolean): string {
  let clean = body.trim();
  if (!hasMedia) return clean;
  clean = clean
    .replace(/\s*https?:\/\/t\.co\/[A-Za-z0-9]+\s*$/i, '')
    .replace(/\s*pic\.twitter\.com\/[A-Za-z0-9]+\s*$/i, '');
  return clean.trim();
}

/**
 * Reads the answer from `api.fxtwitter.com/status/<id>`, keeping only fields the card renders.
 * A mismatched id or a non-200 answer is rejected rather than shown under the wrong link.
 */
export function mapFxTwitterStatus(json: unknown, expectedId: string): XPost | null {
  if (!json || typeof json !== 'object') return null;
  const root = json as Record<string, unknown>;
  if (root.code !== 200) return null;
  const tweet =
    root.tweet && typeof root.tweet === 'object'
      ? (root.tweet as Record<string, unknown>)
      : undefined;
  if (!tweet) return null;

  const rawId =
    typeof tweet.id === 'string'
      ? tweet.id
      : typeof tweet.id === 'number'
        ? String(tweet.id)
        : expectedId;
  if (rawId !== expectedId) return null;

  const author =
    tweet.author && typeof tweet.author === 'object'
      ? (tweet.author as Record<string, unknown>)
      : undefined;
  if (!author) return null;
  const handle = typeof author.screen_name === 'string' ? author.screen_name.replace(/^@/, '') : '';
  if (!/^[A-Za-z0-9_]{1,15}$/.test(handle)) return null;

  const photos: XPostPhoto[] = [];
  let video: XPostVideo | undefined;
  const media =
    tweet.media && typeof tweet.media === 'object'
      ? (tweet.media as Record<string, unknown>)
      : undefined;
  if (media?.photos && Array.isArray(media.photos)) {
    for (const item of media.photos.slice(0, 4)) {
      if (!item || typeof item !== 'object') continue;
      const photo = item as Record<string, unknown>;
      if (!isHttps(photo.url)) continue;
      photos.push({
        url: photo.url,
        width: count(photo.width) || undefined,
        height: count(photo.height) || undefined,
      });
    }
  }
  if (media?.videos && Array.isArray(media.videos)) {
    for (const item of media.videos) {
      if (!item || typeof item !== 'object') continue;
      const candidate = item as Record<string, unknown>;
      if (!isHttps(candidate.thumbnail_url)) continue;
      video = {
        thumbnailUrl: candidate.thumbnail_url,
        url: isHttps(candidate.url) ? candidate.url : undefined,
      };
      break;
    }
  }

  const body = stripMediaTrailer(text(tweet.text), photos.length > 0 || !!video);
  const authorName =
    typeof author.name === 'string' && author.name.trim()
      ? author.name.trim().slice(0, 120)
      : handle;
  // The documented field is is_blue_verified; the live API nests it in verification.
  const verification =
    author.verification && typeof author.verification === 'object'
      ? (author.verification as Record<string, unknown>)
      : undefined;

  return {
    id: rawId,
    text: body.slice(0, 5000),
    authorName,
    handle,
    avatarUrl: isHttps(author.avatar_url) ? author.avatar_url : undefined,
    verified: author.is_blue_verified === true || verification?.verified === true,
    createdAt: typeof tweet.created_at === 'string' ? tweet.created_at : undefined,
    likes: count(tweet.likes),
    replies: count(tweet.replies),
    retweets: count(tweet.retweets),
    photos,
    ...(video ? { video } : {}),
  };
}

function decodeEntities(value: string): string {
  return value
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_match, code: string) => {
      const point = Number(code);
      return Number.isFinite(point) && point > 0 && point <= 0x10ffff
        ? String.fromCodePoint(point)
        : '';
    })
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * The fallback is publish.twitter.com's oEmbed answer, which has no media or counts but does
 * contain the author and the post's words. The trailing "— Name (@handle) date" is not post text.
 */
export function mapTwitterOEmbed(json: unknown, expectedId: string): XPost | null {
  if (!json || typeof json !== 'object') return null;
  const root = json as Record<string, unknown>;
  if (typeof root.author_name !== 'string' || typeof root.html !== 'string') return null;

  const paragraph = /<p\b[^>]*>([\s\S]*?)<\/p>/i.exec(root.html)?.[1] ?? '';
  let body = decodeEntities(paragraph);
  body = body
    .replace(/\s*pic\.twitter\.com\/[A-Za-z0-9]+\s*$/i, '')
    .replace(/\s*https?:\/\/t\.co\/[A-Za-z0-9]+\s*$/i, '')
    .trim();

  const authorUrl = typeof root.author_url === 'string' ? root.author_url : '';
  const handleFromUrl = /(?:twitter|x)\.com\/([A-Za-z0-9_]{1,15})\/?$/i.exec(authorUrl)?.[1];
  const handleFromHtml = /\(@([A-Za-z0-9_]{1,15})\)/.exec(decodeEntities(root.html))?.[1];
  const handle = handleFromUrl ?? handleFromHtml;
  if (!handle) return null;

  return {
    id: expectedId,
    text: body.slice(0, 5000),
    authorName: root.author_name.trim().slice(0, 120) || handle,
    handle,
    verified: false,
    likes: 0,
    replies: 0,
    retweets: 0,
    photos: [],
  };
}

/** 1.2K / 3.4M rather than six digits next to a small icon. */
export function formatCompactCount(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '0';
  if (value >= 1_000_000) return `${trimZero(value / 1_000_000)}M`;
  if (value >= 1000) return `${trimZero(value / 1000)}K`;
  return String(Math.floor(value));
}

function trimZero(value: number): string {
  return value >= 100 ? String(Math.round(value)) : value.toFixed(1).replace(/\.0$/, '');
}

/** A readable date, or nothing when X sent a shape this browser cannot parse. */
export function formatXPostDate(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}
