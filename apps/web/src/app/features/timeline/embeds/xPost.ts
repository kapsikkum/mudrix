import { fetchIntegration } from '@/util/integrationFetch';
import { mapFxTwitterStatus, mapTwitterOEmbed, type XPostResult } from '@/util/xPost';

/**
 * Asks fxtwitter for one post by id, then publish.twitter.com's oEmbed if that fails. Both go
 * through `fetchIntegration`: exact host, https, no cookies or referrer, a size cap and a timeout,
 * and a passive lookup is refused while streamer mode is on. A click makes the retry active.
 */
export async function fetchXPost(
  statusId: string,
  postUrl: string,
  passive: boolean
): Promise<XPostResult | null> {
  const fx = await fetchIntegration({
    url: `https://api.fxtwitter.com/status/${encodeURIComponent(statusId)}`,
    allow: ['api.fxtwitter.com'],
    expect: 'json',
    passive,
    maxBytes: 512 * 1024,
    timeoutMs: 8000,
  });
  if (fx.ok) {
    const post = mapFxTwitterStatus(fx.json, statusId);
    if (post) return { post, via: 'fxtwitter' };
  }

  // publish.twitter.com permanently redirects to publish.x.com, which a browser hides from
  // fetchIntegration when redirects are followed manually. Ask the final host directly.
  const oembedUrl = `https://publish.x.com/oembed?url=${encodeURIComponent(postUrl)}&omit_script=1`;
  const twitter = await fetchIntegration({
    url: oembedUrl,
    allow: ['publish.x.com'],
    expect: 'json',
    passive,
    maxBytes: 256 * 1024,
    timeoutMs: 8000,
  });
  if (twitter.ok) {
    const post = mapTwitterOEmbed(twitter.json, statusId);
    if (post) return { post, via: 'oembed' };
  }
  return null;
}
