import { LINK_EMBED_SERVICE_BY_ID, type LinkEmbedServiceId } from './linkEmbeds';
import type { MastodonPost } from './mastodonPost';
import { formatCompactCount, formatXPostDate, type XPost } from './xPost';

/** The pieces of a Discord-style link embed, independent of React. */
export interface EmbedAuthorData {
  name: string;
  /** The small muted line under the name, such as @handle. */
  meta?: string;
  iconUrl?: string;
  verified?: boolean;
  url?: string;
}

export type EmbedStatKind =
  'reply' | 'repost' | 'like' | 'boost' | 'favourite' | 'score' | 'comments';

export interface EmbedStat {
  kind: EmbedStatKind;
  value: string;
}

export interface EmbedFooterData {
  text?: string;
  stats?: EmbedStat[];
  url: string;
  label: string;
}

export interface EmbedFieldData {
  name: string;
  value: string;
  inline?: boolean;
}

export interface EmbedCardData {
  accent: string;
  author?: EmbedAuthorData;
  title?: string;
  titleUrl?: string;
  description?: string;
  warning?: string;
  thumbnailUrl?: string;
  fields?: EmbedFieldData[];
  footer?: EmbedFooterData;
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

function clean(value: unknown, max = 4096): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : undefined;
}

function stat(kind: EmbedStatKind, value: number): EmbedStat {
  return { kind, value: formatCompactCount(value) };
}

/** A readable title from the slug Reddit puts after the post id, when oEmbed cannot answer. */
export function redditTitleFromUrl(url: string): string | undefined {
  try {
    const parts = new URL(url).pathname.split('/').filter(Boolean);
    const slug = parts[0] === 'r' && parts[2] === 'comments' ? parts[4] : parts[2];
    if (!slug) return undefined;
    const words = decodeURIComponent(slug).replace(/[_-]+/g, ' ').trim();
    return words ? words.charAt(0).toUpperCase() + words.slice(1) : undefined;
  } catch {
    return undefined;
  }
}

/** The subreddit named by `/r/<sub>/comments/<id>`, for the author row. */
export function redditSubreddit(url: string): string | undefined {
  try {
    const parts = new URL(url).pathname.split('/').filter(Boolean);
    if (parts[0] === 'r' && parts[2] === 'comments' && /^[A-Za-z0-9_]{2,32}$/.test(parts[1])) {
      return parts[1];
    }
  } catch {
    // not a URL
  }
  return undefined;
}

export function xPostEmbedData(post: XPost, url: string, openLabel: string): EmbedCardData {
  const service = LINK_EMBED_SERVICE_BY_ID.x;
  return {
    accent: service.accent,
    author: {
      name: post.authorName,
      meta: `@${post.handle}`,
      iconUrl: isHttps(post.avatarUrl) ? post.avatarUrl : undefined,
      verified: post.verified,
      url,
    },
    description: clean(post.text),
    footer: {
      text: formatXPostDate(post.createdAt),
      stats: [stat('reply', post.replies), stat('repost', post.retweets), stat('like', post.likes)],
      url,
      label: openLabel,
    },
  };
}

export function mastodonEmbedData(post: MastodonPost, openLabel: string): EmbedCardData {
  const service = LINK_EMBED_SERVICE_BY_ID.mastodon;
  return {
    accent: service.accent,
    author: {
      name: post.authorName,
      meta: `@${post.handle}`,
      iconUrl: isHttps(post.avatarUrl) ? post.avatarUrl : undefined,
      url: post.url,
    },
    description: clean(post.text),
    warning: clean(post.warning, 2048),
    footer: {
      text: formatXPostDate(post.createdAt),
      stats: [
        stat('reply', post.replies),
        stat('boost', post.reblogs),
        stat('favourite', post.favourites),
      ],
      url: post.url,
      label: openLabel,
    },
  };
}

export interface RedditEmbedInput {
  url: string;
  title?: string;
  description?: string;
  author?: string;
  thumbnailUrl?: string;
  score?: number;
  comments?: number;
  openLabel: string;
}

export function redditEmbedData(input: RedditEmbedInput): EmbedCardData {
  const service = LINK_EMBED_SERVICE_BY_ID.reddit;
  const sub = redditSubreddit(input.url);
  const author = clean(input.author, 120)?.replace(/^u\//i, '');
  const stats: EmbedStat[] = [];
  if (typeof input.score === 'number' && input.score >= 0) stats.push(stat('score', input.score));
  if (typeof input.comments === 'number' && input.comments >= 0) {
    stats.push(stat('comments', input.comments));
  }
  // A URL preview often carries the link itself as its title. The slug reads better and is what
  // Reddit shows, so use it instead of repeating the URL in the card.
  const rawTitle = clean(input.title, 256);
  const title =
    rawTitle && !/^https?:\/\//i.test(rawTitle)
      ? rawTitle
      : (redditTitleFromUrl(input.url) ?? rawTitle ?? input.url);
  return {
    accent: service.accent,
    author: {
      name: sub ? `r/${sub}` : 'Reddit',
      meta: author ? `u/${author}` : undefined,
      url: input.url,
    },
    title,
    titleUrl: input.url,
    description: clean(input.description),
    thumbnailUrl: isHttps(input.thumbnailUrl) ? input.thumbnailUrl : undefined,
    footer: {
      text: 'Reddit',
      stats: stats.length ? stats : undefined,
      url: input.url,
      label: input.openLabel,
    },
  };
}

export interface ProviderEmbedInput {
  service: LinkEmbedServiceId;
  url: string;
  title?: string;
  description?: string;
  thumbnailUrl?: string;
  openLabel: string;
}

/** A provider row in the footer and, when the metadata has one, its title and description. */
export function providerEmbedData(input: ProviderEmbedInput): EmbedCardData {
  const service = LINK_EMBED_SERVICE_BY_ID[input.service];
  return {
    accent: service.accent,
    title: clean(input.title, 256),
    titleUrl: clean(input.title, 256) ? input.url : undefined,
    description: clean(input.description),
    thumbnailUrl: isHttps(input.thumbnailUrl) ? input.thumbnailUrl : undefined,
    footer: {
      text: service.label,
      url: input.url,
      label: input.openLabel,
    },
  };
}
