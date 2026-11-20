import { fetchIntegration } from '@/util/integrationFetch';
import { mapMastodonStatus, type MastodonPost } from '@/util/mastodonPost';
import type { LinkEmbedMatch } from '@/util/linkEmbeds';

/**
 * Reads the status from the instance's public API. Show is consent, so this is an active request
 * even in an encrypted room; the allow-list is exactly that one instance.
 */
export async function fetchMastodonPost(match: LinkEmbedMatch): Promise<MastodonPost | null> {
  const source = match.metadata;
  if (source?.kind !== 'mastodon') return null;

  const result = await fetchIntegration({
    url: source.url,
    allow: source.allow,
    expect: 'json',
    passive: false,
    maxBytes: 512 * 1024,
    timeoutMs: 8000,
  });
  if (!result.ok) return null;
  return mapMastodonStatus(result.json, match.url);
}
