import type { LinkEmbedCard } from '@/core/rpc/api.gen';

export type CardFetcher = (url: string) => Promise<LinkEmbedCard | null>;

export interface CardCache {
  /** The card for a link: from the session cache, an identical request in flight, or a new one. */
  get(url: string): Promise<LinkEmbedCard | null>;
  clear(): void;
}

/**
 * Remembers what embeds.now answered for the session. An answer (a card, or "no card") is kept;
 * a failure is not, so the next look tries again. Asking twice at once shares one request.
 */
export function createCardCache(fetcher: CardFetcher, maxEntries = 200): CardCache {
  const done = new Map<string, LinkEmbedCard | null>();
  const pending = new Map<string, Promise<LinkEmbedCard | null>>();

  return {
    get(url) {
      if (done.has(url)) return Promise.resolve(done.get(url) ?? null);
      const inFlight = pending.get(url);
      if (inFlight) return inFlight;
      const request = fetcher(url).then(
        (card) => {
          pending.delete(url);
          if (done.size >= maxEntries) done.delete(done.keys().next().value as string);
          done.set(url, card);
          return card;
        },
        (error: unknown) => {
          pending.delete(url);
          throw error;
        }
      );
      pending.set(url, request);
      return request;
    },
    clear() {
      done.clear();
      pending.clear();
    },
  };
}
