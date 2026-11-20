import type { GifItem } from './gifProviders/types';

/**
 * GIFs are ordinary room messages with an `m.image` body: the timeline then draws them in the normal
 * image bubble, and the gallery and image viewer work on them. `m.sticker` would not (and the core
 * sends typed content, where a sticker is a different event shape entirely).
 */
export const GIF_EVENT_TYPE = 'm.room.message';

/** Event content field recording which provider GIF a sent message came from. */
export const GIF_SOURCE_FIELD = 'xyz.mudrix.gif';

export interface GifImageInfo {
  mimetype: string;
  size?: number;
  is_animated?: boolean;
  w?: number;
  h?: number;
}

/** Where the GIF's bytes live: a homeserver URL, or an encrypted file descriptor. */
export type GifSource = { url: string } | { file: unknown };

/** The `m.room.message` content a GIF is sent as. */
export function gifContent(
  item: GifItem,
  source: GifSource,
  info: GifImageInfo
): Record<string, unknown> {
  return {
    msgtype: 'm.image',
    body: item.title || 'GIF',
    info,
    ...source,
    [GIF_SOURCE_FIELD]: { provider: item.provider, id: item.id },
  };
}
