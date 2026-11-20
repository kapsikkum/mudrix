/** A Mastodon status, reduced to what the timeline card renders. */
export interface MastodonMedia {
  type: 'image' | 'video' | 'gifv' | 'audio' | 'unknown';
  url: string;
  previewUrl?: string;
  description?: string;
}

export interface MastodonPost {
  url: string;
  authorName: string;
  /** user@instance, without the leading @. */
  handle: string;
  avatarUrl?: string;
  text: string;
  warning?: string;
  createdAt?: string;
  replies: number;
  reblogs: number;
  favourites: number;
  media: MastodonMedia[];
}

const MEDIA_TYPES: MastodonMedia['type'][] = ['image', 'video', 'gifv', 'audio'];

function isHttps(value: unknown): value is string {
  if (typeof value !== 'string' || !value.startsWith('https://')) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password;
  } catch {
    return false;
  }
}

function text(value: unknown, max = 5000): string | undefined {
  if (typeof value !== 'string') return undefined;
  const clean = value.replace(/\s+/g, ' ').trim();
  return clean ? clean.slice(0, max) : undefined;
}

function count(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

/** Mastodon returns HTML; keep the words and line breaks, never markup. */
export function mastodonHtmlToText(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>\s*<p\b[^>]*>/gi, '\n\n')
    .replace(/<\/p>/gi, '\n')
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
    .trim()
    .slice(0, 5000);
}

/** Reads `api/v1/statuses/:id`; a status without an account or text shape is rejected. */
export function mapMastodonStatus(json: unknown, fallbackUrl: string): MastodonPost | null {
  if (!json || typeof json !== 'object') return null;
  const root = json as Record<string, unknown>;
  const account =
    root.account && typeof root.account === 'object'
      ? (root.account as Record<string, unknown>)
      : undefined;
  if (!account) return null;

  const acct = typeof account.acct === 'string' ? account.acct.replace(/^@/, '').trim() : '';
  if (!acct || !/^[A-Za-z0-9_.-]+(@[A-Za-z0-9.-]+)?$/.test(acct)) return null;

  let host = '';
  try {
    host = new URL(fallbackUrl).hostname;
  } catch {
    // keep an empty host; the handle below is still useful if acct names its instance
  }
  const handle = acct.includes('@') || !host ? acct : `${acct}@${host}`;
  const displayName = text(account.display_name, 120);
  const body = mastodonHtmlToText(root.content);
  const warning = text(root.spoiler_text, 400);
  if (!body && !warning && !Array.isArray(root.media_attachments)) return null;

  const media: MastodonMedia[] = [];
  if (Array.isArray(root.media_attachments)) {
    for (const item of root.media_attachments.slice(0, 4)) {
      if (!item || typeof item !== 'object') continue;
      const attachment = item as Record<string, unknown>;
      if (!isHttps(attachment.url)) continue;
      const type =
        typeof attachment.type === 'string' &&
        MEDIA_TYPES.includes(attachment.type as MastodonMedia['type'])
          ? (attachment.type as MastodonMedia['type'])
          : 'unknown';
      media.push({
        type,
        url: attachment.url,
        previewUrl: isHttps(attachment.preview_url) ? attachment.preview_url : undefined,
        description: text(attachment.description, 400),
      });
    }
  }

  const statusUrl = isHttps(root.url) ? root.url : fallbackUrl;
  return {
    url: statusUrl,
    authorName: displayName || acct,
    handle,
    avatarUrl: isHttps(account.avatar) ? account.avatar : undefined,
    text: body,
    warning,
    createdAt: typeof root.created_at === 'string' ? root.created_at : undefined,
    replies: count(root.replies_count),
    reblogs: count(root.reblogs_count),
    favourites: count(root.favourites_count),
    media,
  };
}
