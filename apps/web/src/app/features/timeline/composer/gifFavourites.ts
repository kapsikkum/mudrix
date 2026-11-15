import type { GifItem, GifProviderId } from './gifProviders/types';

/** Which service a GIF URL belongs to, by its host: everything else is GIPHY's. */
export function gifProviderForUrl(url: string): GifProviderId {
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (host === 'klipy.com' || host.endsWith('.klipy.com')) return 'klipy';
  } catch {
    // mxc:// and other non-http URLs keep the default provider
  }
  return 'giphy';
}

/**
 * A saved GIF is only its URL: the Recent and Favourite tabs draw it from the send URL alone. A GIF
 * favourited from a message lives on the homeserver, so its URL is `mxc://`.
 */
export function favouriteGifItem(url: string): GifItem {
  return {
    id: url,
    title: '',
    thumbUrl: url,
    sendUrl: url,
    width: 0,
    height: 0,
    provider: gifProviderForUrl(url),
  };
}
