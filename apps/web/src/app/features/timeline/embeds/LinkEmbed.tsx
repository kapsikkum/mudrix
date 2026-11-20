import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSetAtom } from 'jotai';
import { useQuery } from '@tanstack/react-query';
import type { MudrixClient } from '@mudrix/core';
import { useLinkPreview } from '@/app/hooks/useLinkPreview';
import { fetchMediaBlobUrl } from '@/app/components/Avatar';
import { linkEmbedModeAtoms } from '@/app/store/atoms';
import { providerEmbedData } from '@/util/embedCard';
import { checkPublicHttpsUrl } from '@/util/integrationFetch';
import {
  LINK_EMBED_SERVICE_BY_ID,
  planLinkEmbed,
  type LinkEmbedMatch,
  type LinkEmbedMode,
} from '@/util/linkEmbeds';
import { fetchLinkEmbedMetadata, fetchResolvedEmbed } from './metadata';
import { DiscordEmbed } from './DiscordEmbed';
import * as mediaCss from './DiscordEmbed.css';
import * as css from './LinkEmbed.css';

interface LinkEmbedProps {
  url: string;
  match: LinkEmbedMatch;
  mode: LinkEmbedMode;
  client: MudrixClient;
  isEncrypted: boolean;
}

/**
 * Every service without a dedicated card. The official iframe is created immediately when the
 * service is on; otherwise the same Discord-style shell carries the homeserver/oEmbed title,
 * description and picture, or the real URL for a short link.
 */
export function LinkEmbed({ url, match, mode, client, isEncrypted }: LinkEmbedProps) {
  const { t } = useTranslation();
  const setMode = useSetAtom(linkEmbedModeAtoms[match.service]);
  const service = LINK_EMBED_SERVICE_BY_ID[match.service];
  const label = service.label;
  const plan = planLinkEmbed(match, mode);

  const safeFrame = plan?.kind === 'iframe' ? checkPublicHttpsUrl(plan.src) : null;
  const { data: resolvedEmbed } = useQuery({
    queryKey: ['linkEmbedResolve', match.service, match.url],
    queryFn: () => fetchResolvedEmbed(match),
    enabled: mode === 'on' && !!match.resolve,
    staleTime: 30 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    retry: false,
  });
  const resolvedFrame = resolvedEmbed ? checkPublicHttpsUrl(resolvedEmbed) : null;
  const frameSrc = safeFrame?.ok
    ? safeFrame.url.href
    : resolvedFrame?.ok
      ? resolvedFrame.url.href
      : null;
  const isFrame = !!frameSrc;

  const { data, isLoading: previewLoading } = useLinkPreview(
    client,
    mode === 'on' ? url : null,
    isEncrypted
  );

  const { data: metadata } = useQuery({
    queryKey: ['linkEmbedMetadata', match.service, match.url],
    queryFn: () => fetchLinkEmbedMetadata(match, false),
    enabled: mode === 'on' && !previewLoading && !data?.title && !!match.metadata,
    staleTime: 30 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    retry: false,
  });

  const [thumb, setThumb] = useState<string | null>(null);
  const ogImage = data?.imageUrl ?? undefined;
  useEffect(() => {
    setThumb(null);
    if (mode !== 'on' || isFrame || !ogImage?.startsWith('mxc://')) return undefined;
    let cancelled = false;
    fetchMediaBlobUrl(ogImage, client, 1).then((blobUrl) => {
      // Owned by the shared media cache; never revoke it here.
      if (!blobUrl || cancelled) return;
      setThumb(blobUrl);
    });
    return () => {
      cancelled = true;
    };
  }, [ogImage, client, mode, isFrame]);

  if (!plan) return null;

  if (plan.kind === 'prompt') {
    return (
      <div className={`${css.card} ${css.promptCard}`} style={{ borderLeftColor: service.accent }}>
        <span className={css.provider}>{label}</span>
        <span className={css.promptText}>
          {t('timeline.linkEmbed.consent', { service: label })}
        </span>
        <div className={css.promptActions}>
          <button type="button" className={css.btnPrimary} onClick={() => setMode('on')}>
            {t('timeline.linkEmbed.allow')}
          </button>
          <button type="button" className={css.btn} onClick={() => setMode('off')}>
            {t('timeline.linkEmbed.deny')}
          </button>
        </div>
      </div>
    );
  }

  const metaThumb =
    metadata?.thumbnailUrl && checkPublicHttpsUrl(metadata.thumbnailUrl).ok
      ? metadata.thumbnailUrl
      : null;
  const title = data?.title ?? metadata?.title ?? (isFrame ? undefined : match.url);

  return (
    <DiscordEmbed
      {...providerEmbedData({
        service: match.service,
        url: match.url,
        title: title ?? undefined,
        description: data?.description ?? metadata?.description ?? undefined,
        thumbnailUrl: isFrame ? undefined : (thumb ?? metaThumb ?? undefined),
        openLabel: t('timeline.linkEmbed.open', { service: label }),
      })}
      media={
        frameSrc ? (
          <div style={{ height: match.player?.height ?? 300 }}>
            <iframe
              className={mediaCss.mediaFrame}
              src={frameSrc}
              title={label}
              allow={match.iframeAllow}
              allowFullScreen
              referrerPolicy="strict-origin-when-cross-origin"
              loading="eager"
            />
          </div>
        ) : undefined
      }
    />
  );
}
