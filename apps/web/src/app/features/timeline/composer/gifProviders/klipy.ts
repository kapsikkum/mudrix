import {
  GifNotConfiguredError,
  GifRateLimitedError,
  type GifItem,
  type GifPage,
  type GifProvider,
  type GifRequestOptions,
} from './types';

/** API key embedded at build time (VITE_KLIPY_API_KEY). It is a path segment of every request. */
export const KLIPY_API_KEY = (import.meta.env.VITE_KLIPY_API_KEY ?? '').trim();
const klipyApi = () => `https://api.klipy.com/api/v1/${encodeURIComponent(KLIPY_API_KEY)}`;
const PER_PAGE = 24;
export const KLIPY_MAX_GIF_BYTES = 25 * 1024 * 1024;

interface KlipyRendition {
  url?: unknown;
  width?: unknown;
  height?: unknown;
  size?: unknown;
}

type KlipyFile = Record<string, Record<string, KlipyRendition> | undefined>;

const SEND_ORDER = ['md', 'hd', 'sm'];
const THUMB_ORDER = ['sm', 'xs', 'md'];

/** Accept only https URLs on klipy.com or its subdomains. */
export function isAllowedKlipyUrl(raw: unknown): raw is string {
  if (typeof raw !== 'string') return false;
  try {
    const u = new URL(raw);
    return (
      u.protocol === 'https:' && (u.hostname === 'klipy.com' || u.hostname.endsWith('.klipy.com'))
    );
  } catch {
    return false;
  }
}

function pickGif(
  file: KlipyFile,
  order: string[]
): { url: string; width: number; height: number; size: number } | null {
  for (const size of order) {
    const r = file[size]?.gif;
    if (r && isAllowedKlipyUrl(r.url)) {
      return {
        url: r.url,
        width: Number(r.width) || 0,
        height: Number(r.height) || 0,
        size: Number(r.size) || 0,
      };
    }
  }
  return null;
}

export function klipyItemFromRaw(raw: unknown): GifItem | null {
  if (!raw || typeof raw !== 'object') return null;
  const entry = raw as Record<string, unknown>;
  if (entry.type !== undefined && entry.type !== 'gif') return null;
  if (typeof entry.id !== 'string' && typeof entry.id !== 'number') return null;
  const file = entry.file as KlipyFile | undefined;
  if (!file || typeof file !== 'object') return null;
  const send = pickGif(file, SEND_ORDER);
  const thumb = pickGif(file, THUMB_ORDER);
  if (!send || !thumb) return null;
  if (send.size > KLIPY_MAX_GIF_BYTES) return null;
  return {
    id: String(entry.id),
    title: typeof entry.title === 'string' ? entry.title : '',
    thumbUrl: thumb.url,
    sendUrl: send.url,
    width: thumb.width || send.width || 1,
    height: thumb.height || send.height || 1,
    provider: 'klipy',
  };
}

async function request(
  endpoint: 'trending' | 'search',
  params: Record<string, string>,
  { cursor = 1, signal }: GifRequestOptions
): Promise<GifPage> {
  const qs = new URLSearchParams({ ...params, per_page: String(PER_PAGE), page: String(cursor) });
  if (!KLIPY_API_KEY) throw new GifNotConfiguredError();
  const res = await fetch(`${klipyApi()}/gifs/${endpoint}?${qs.toString()}`, { signal });
  if (res.status === 429) throw new GifRateLimitedError();
  if (!res.ok) throw new Error(`KLIPY request failed (${res.status})`);
  const body = await res.json();
  if (!body || body.result === false) throw new Error('KLIPY request failed');
  const list: unknown[] = Array.isArray(body.data?.data) ? body.data.data : [];
  const seen = new Set<string>();
  const items: GifItem[] = [];
  for (const raw of list) {
    const item = klipyItemFromRaw(raw);
    if (item && !seen.has(item.id)) {
      seen.add(item.id);
      items.push(item);
    }
  }
  return { items, nextCursor: body.data?.has_next === true ? cursor + 1 : null };
}

export const klipyProvider: GifProvider = {
  id: 'klipy',
  displayName: 'KLIPY',
  hosts: ['api.klipy.com', '*.klipy.com'],
  trending: (opts = {}) => request('trending', {}, opts),
  search: (query, opts = {}) => request('search', { q: query.trim() }, opts),
};
