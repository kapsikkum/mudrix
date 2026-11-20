import { fetchIntegration } from '@/util/integrationFetch';
import type { LinkEmbedMatch } from '@/util/linkEmbeds';

export interface LinkEmbedMetadata {
  title?: string;
  author?: string;
  description?: string;
  thumbnailUrl?: string;
}

function text(value: unknown, max = 500): string | undefined {
  if (typeof value !== 'string') return undefined;
  const clean = value.replace(/\s+/g, ' ').trim();
  return clean ? clean.slice(0, max) : undefined;
}

/** Mastodon's API returns HTML; keep only the words, never markup. */
function plainText(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const clean = value
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
  return clean ? clean.slice(0, 400) : undefined;
}

function httpsImage(value: unknown): string | undefined {
  const url = text(value, 2000);
  return url?.startsWith('https://') ? url : undefined;
}

/**
 * Turns a Bluesky handle link into its official embed after resolving the handle to a DID.
 * `on` is consent, so this is an active request; the allow-list is exactly the public AppView.
 */
export async function fetchResolvedEmbed(match: LinkEmbedMatch): Promise<string | null> {
  const source = match.resolve;
  if (source?.kind !== 'bluesky') return null;
  const result = await fetchIntegration({
    url: source.url,
    allow: source.allow,
    expect: 'json',
    passive: false,
    maxBytes: 64 * 1024,
    timeoutMs: 8000,
  });
  if (!result.ok || !result.json || typeof result.json !== 'object') return null;
  const did = (result.json as Record<string, unknown>).did;
  if (typeof did !== 'string' || !/^did:[a-z]+:[A-Za-z0-9._:%-]+$/.test(did)) return null;
  return `https://embed.bsky.app/embed/${did}/app.bsky.feed.post/${source.rkey}`;
}

/**
 * Asks the service for a title/author/picture only when the card is allowed to contact it and
 * the person has not been left in an encrypted room. `fetchIntegration` enforces the exact host
 * allow-list, https, no credentials, no cookies or referrer, a size cap and a timeout; it also
 * refuses a passive lookup while streamer mode is on. Failure is never fatal: the card simply
 * keeps what the URL and the homeserver preview already say.
 */
export async function fetchLinkEmbedMetadata(
  match: LinkEmbedMatch,
  passive: boolean
): Promise<LinkEmbedMetadata | null> {
  const source = match.metadata;
  if (!source) return null;

  const result = await fetchIntegration({
    url: source.url,
    allow: source.allow,
    expect: 'json',
    passive,
    maxBytes: 256 * 1024,
    timeoutMs: 8000,
  });
  if (!result.ok || !result.json || typeof result.json !== 'object') return null;
  const json = result.json as Record<string, unknown>;

  if (source.kind === 'mastodon') {
    const account =
      json.account && typeof json.account === 'object'
        ? (json.account as Record<string, unknown>)
        : undefined;
    return {
      author: text(account?.display_name, 120) ?? text(account?.acct, 120),
      description: text(json.spoiler_text, 400) ?? plainText(json.content),
    };
  }

  return {
    title: text(json.title),
    author: text(json.author_name, 120),
    description: text(json.description, 400),
    // The official oEmbed answer names the service's own CDN.
    thumbnailUrl: httpsImage(json.thumbnail_url),
  };
}
