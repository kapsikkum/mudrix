import type { GifItem, GifProviderId } from './gifProviders/types';

/** How many sent GIFs the Recent tab keeps. */
export const GIF_RECENT_CAP = 60;

const PROVIDERS: GifProviderId[] = ['giphy', 'klipy'];

function parseItem(entry: unknown): GifItem | null {
  if (!entry || typeof entry !== 'object') return null;
  const obj = entry as Record<string, unknown>;
  const sendUrl = typeof obj.sendUrl === 'string' ? obj.sendUrl : '';
  if (!sendUrl) return null;
  const provider = PROVIDERS.find((id) => id === obj.provider) ?? 'giphy';
  return {
    id: typeof obj.id === 'string' && obj.id ? obj.id : sendUrl,
    title: typeof obj.title === 'string' ? obj.title : '',
    thumbUrl: typeof obj.thumbUrl === 'string' && obj.thumbUrl ? obj.thumbUrl : sendUrl,
    sendUrl,
    width: Number(obj.width) || 0,
    height: Number(obj.height) || 0,
    provider,
  };
}

/** The stored recent GIFs, a raw GIPHY object from an older build included. */
export function parseRecentList(raw: string | null): GifItem[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const seen = new Set<string>();
    const items: GifItem[] = [];
    for (const entry of parsed) {
      const item = parseItem(entry);
      if (!item || seen.has(item.sendUrl)) continue;
      seen.add(item.sendUrl);
      items.push(item);
    }
    return items.slice(0, GIF_RECENT_CAP);
  } catch {
    return [];
  }
}

/** The list with `item` moved to the front, as sending it records it. */
export function withRecentGif(list: GifItem[], item: GifItem): GifItem[] {
  return [item, ...list.filter((entry) => entry.sendUrl !== item.sendUrl)].slice(0, GIF_RECENT_CAP);
}
