import { useTranslation } from 'react-i18next';
import { useSetAtom } from 'jotai';
import { useQuery } from '@tanstack/react-query';
import type { MudrixClient } from '@mudrix/core';
import { useLinkPreview } from '@/app/hooks/useLinkPreview';
import { linkEmbedModeAtoms } from '@/app/store/atoms';
import { redditEmbedData } from '@/util/embedCard';
import { checkPublicHttpsUrl } from '@/util/integrationFetch';
import type { LinkEmbedMatch, LinkEmbedMode } from '@/util/linkEmbeds';
import { fetchLinkEmbedMetadata } from './metadata';
import { DiscordEmbed } from './DiscordEmbed';
import * as mediaCss from './DiscordEmbed.css';
import * as promptCss from './LinkEmbed.css';

interface RedditEmbedProps {
  match: LinkEmbedMatch;
  mode: LinkEmbedMode;
  client: MudrixClient;
  isEncrypted: boolean;
}

/**
 * Reddit's official redditmedia iframe carries the title, selftext, pictures and video. The shell
 * adds the subreddit, author and homeserver/oEmbed title around it. No Reddit JSON API is used
 * (it answers 403), so score and comment counts only exist inside the iframe.
 */
export function RedditEmbed({ match, mode, client, isEncrypted }: RedditEmbedProps) {
  const { t } = useTranslation();
  const setMode = useSetAtom(linkEmbedModeAtoms.reddit);
  const { data: preview, isLoading: previewLoading } = useLinkPreview(
    client,
    mode === 'on' ? match.url : null,
    isEncrypted
  );
  const { data: metadata } = useQuery({
    queryKey: ['redditEmbedMetadata', match.url],
    queryFn: () => fetchLinkEmbedMetadata(match, false),
    enabled: mode === 'on' && !previewLoading && !preview?.title && !!match.metadata,
    staleTime: 30 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    retry: false,
  });

  if (mode === 'off') return null;

  if (mode === 'ask') {
    return (
      <div
        className={`${promptCss.card} ${promptCss.promptCard}`}
        style={{ borderLeftColor: '#ff4500' }}
      >
        <span className={promptCss.provider}>Reddit</span>
        <span className={promptCss.promptText}>
          {t('timeline.linkEmbed.consent', { service: 'Reddit' })}
        </span>
        <div className={promptCss.promptActions}>
          <button type="button" className={promptCss.btnPrimary} onClick={() => setMode('on')}>
            {t('timeline.linkEmbed.allow')}
          </button>
          <button type="button" className={promptCss.btn} onClick={() => setMode('off')}>
            {t('timeline.linkEmbed.deny')}
          </button>
        </div>
      </div>
    );
  }

  const safe = match.embedUrl ? checkPublicHttpsUrl(match.embedUrl) : null;
  const frame = safe?.ok ? (
    <iframe
      className={mediaCss.mediaFrame}
      src={safe.url.href}
      title={preview?.title || metadata?.title || 'Reddit'}
      allow={match.iframeAllow}
      allowFullScreen
      referrerPolicy="strict-origin-when-cross-origin"
      loading="eager"
    />
  ) : undefined;

  return (
    <DiscordEmbed
      {...redditEmbedData({
        url: match.url,
        title: preview?.title ?? metadata?.title,
        description: preview?.description ?? metadata?.description ?? undefined,
        author: metadata?.author,
        openLabel: t('timeline.linkEmbed.open', { service: 'Reddit' }),
      })}
      media={frame ? <div style={{ height: match.player?.height ?? 620 }}>{frame}</div> : undefined}
    />
  );
}
