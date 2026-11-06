import { STORAGE_KEY_GIF_SEARCH_CONSENT } from '@/const/storageKeys';
import { KLIPY_API_KEY, isAllowedKlipyUrl, klipyItemFromRaw } from './klipy';
import type { GifItem, GifProviderId } from './types';

/** A bare GIPHY / KLIPY link, before it is resolved to a downloadable GIF. */
export type GifLink =
  | { provider: 'giphy'; id: string }
  | { provider: 'klipy'; slug: string }
  | { provider: 'klipy'; mediaUrl: string };

const GIPHY_ID = /^[A-Za-z0-9]{6,32}$/;
const KLIPY_SLUG = /^[a-z0-9][a-z0-9_-]{0,200}$/i;

function giphyIdFrom(host: string, parts: string[]): string | null {
  const [first, second] = parts;
  if (host === 'i.giphy.com') {
    const id = (first === 'media' ? second : first)?.replace(/\.gif$/i, '');
    return id && GIPHY_ID.test(id) ? id : null;
  }
  if (/^media\d*\.giphy\.com$/.test(host)) {
    return first === 'media' && second && GIPHY_ID.test(second) ? second : null;
  }
  if (host === 'giphy.com' || host === 'www.giphy.com') {
    if (first === 'gifs' || first === 'embed') {
      // /gifs/some-title-<id> or /gifs/<id>
      const id = second?.split('-').pop();
      return id && GIPHY_ID.test(id) ? id : null;
    }
  }
  return null;
}

/**
 * Recognises a message that is nothing but one GIPHY or KLIPY link. Anything else (text around
 * the link, other hosts, lookalike domains) returns null and stays an ordinary message.
 */
export function parseGifLink(text: string): GifLink | null {
  const trimmed = text.trim();
  if (!trimmed || /\s/.test(trimmed)) return null;
  let url: URL;
  try {
    url = new URL(trimmed.replace(/^<(.*)>$/, '$1'));
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || url.username || url.password) return null;
  const host = url.hostname.toLowerCase();
  const parts = url.pathname.split('/').filter(Boolean);

  const giphyId = giphyIdFrom(host, parts);
  if (giphyId) return { provider: 'giphy', id: giphyId };

  if (host === 'klipy.com' || host === 'www.klipy.com') {
    const at = parts.indexOf('gifs');
    const slug = at >= 0 ? parts[at + 1] : undefined;
    return slug && KLIPY_SLUG.test(slug) ? { provider: 'klipy', slug } : null;
  }
  if (host.endsWith('.klipy.com') && isAllowedKlipyUrl(url.href) && /\.gif$/i.test(url.pathname)) {
    return { provider: 'klipy', mediaUrl: url.href };
  }
  return null;
}

/** Turns a recognised link into a GIF that can be shown or sent; null when it can't be resolved. */
export async function resolveGifLink(link: GifLink, signal?: AbortSignal): Promise<GifItem | null> {
  if (link.provider === 'giphy') {
    const src = `https://media.giphy.com/media/${link.id}/giphy.gif`;
    return {
      id: link.id,
      title: 'GIF',
      thumbUrl: src,
      sendUrl: src,
      width: 0,
      height: 0,
      provider: 'giphy',
    };
  }
  if ('mediaUrl' in link) {
    return {
      id: link.mediaUrl,
      title: 'GIF',
      thumbUrl: link.mediaUrl,
      sendUrl: link.mediaUrl,
      width: 0,
      height: 0,
      provider: 'klipy',
    };
  }
  if (!KLIPY_API_KEY) return null;
  const res = await fetch(
    `https://api.klipy.com/api/v1/${encodeURIComponent(KLIPY_API_KEY)}/gifs/items?slugs=${encodeURIComponent(link.slug)}`,
    { signal }
  );
  if (!res.ok) return null;
  const body = await res.json();
  const list: unknown[] = Array.isArray(body?.data?.data) ? body.data.data : [];
  return list.length > 0 ? klipyItemFromRaw(list[0]) : null;
}

// '1' = legacy consent (Giphy only), '2' = consent covering Giphy and KLIPY (see GifConsentGate).
export function hasGifConsent(provider: GifProviderId): boolean {
  try {
    const consent = localStorage.getItem(STORAGE_KEY_GIF_SEARCH_CONSENT);
    return consent === '2' || (consent === '1' && provider === 'giphy');
  } catch {
    return false;
  }
}
