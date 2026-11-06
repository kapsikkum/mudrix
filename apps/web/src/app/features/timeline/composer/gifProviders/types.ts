export type GifProviderId = 'giphy' | 'klipy';

export const GIF_PROVIDER_IDS: readonly GifProviderId[] = ['giphy', 'klipy'];

export interface GifItem {
  id: string;
  title: string;
  /** URL shown in the picker grid. */
  thumbUrl: string;
  /** URL downloaded and re-uploaded when the GIF is sent. */
  sendUrl: string;
  width: number;
  height: number;
  provider: GifProviderId;
}

export interface GifPage {
  items: GifItem[];
  /** Cursor (Giphy: offset, Klipy: 1-based page) for the next request, or null when exhausted. */
  nextCursor: number | null;
}

export interface GifRequestOptions {
  cursor?: number;
  signal?: AbortSignal;
}

export interface GifProvider {
  id: GifProviderId;
  displayName: string;
  /** CDN hosts the GIF media is loaded from (API calls go to api.giphy.com / api.klipy.com). */
  hosts: string[];
  trending(opts?: GifRequestOptions): Promise<GifPage>;
  search(query: string, opts?: GifRequestOptions): Promise<GifPage>;
}

export class GifRateLimitedError extends Error {
  constructor() {
    super('rate limited');
    this.name = 'GifRateLimitedError';
  }
}

/** No API key for this provider was embedded in this build. */
export class GifNotConfiguredError extends Error {
  constructor() {
    super('no API key configured in this build');
    this.name = 'GifNotConfiguredError';
  }
}

export function isAbortError(err: unknown): boolean {
  return err instanceof DOMException && err.name === 'AbortError';
}
