import { GIPHY_API_KEY, giphyProvider } from './giphy';
import { KLIPY_API_KEY, klipyProvider } from './klipy';
import type { GifProvider, GifProviderId } from './types';

export * from './types';
export { downloadGif } from './download';
export { parseGifLink, resolveGifLink, hasGifConsent, type GifLink } from './links';

const PROVIDERS: Record<GifProviderId, GifProvider> = {
  giphy: giphyProvider,
  klipy: klipyProvider,
};

export function getGifProvider(id: GifProviderId): GifProvider {
  return PROVIDERS[id];
}

export function parseGifProviderId(value: unknown): GifProviderId {
  return value === 'klipy' ? 'klipy' : 'giphy';
}

/** A provider is configured iff its build-time API key is a non-empty string. */
export function isGifProviderConfigured(id: GifProviderId): boolean {
  return (id === 'klipy' ? KLIPY_API_KEY : GIPHY_API_KEY).length > 0;
}
