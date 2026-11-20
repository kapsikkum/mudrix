import type { CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { useSetAtom } from 'jotai';
import { useQuery } from '@tanstack/react-query';
import { PlayIcon } from '@phosphor-icons/react';
import { linkEmbedModeAtoms } from '@/app/store/atoms';
import { providerEmbedData, xPostEmbedData } from '@/util/embedCard';
import type { LinkEmbedMatch, LinkEmbedMode } from '@/util/linkEmbeds';
import type { XPost } from '@/util/xPost';
import { fetchXPost } from './xPost';
import { DiscordEmbed } from './DiscordEmbed';
import * as mediaCss from './DiscordEmbed.css';
import * as promptCss from './LinkEmbed.css';

interface XPostEmbedProps {
  url: string;
  match: LinkEmbedMatch;
  mode: LinkEmbedMode;
}

function XMedia({ post, url }: { post: XPost; url: string }) {
  const { t } = useTranslation();
  const photoCount = post.photos.length;

  return (
    <>
      {photoCount > 0 && (
        <div
          className={mediaCss.mediaGrid}
          style={{ gridTemplateColumns: photoCount === 1 ? '1fr' : 'repeat(2, 1fr)' }}
        >
          {post.photos.map((photo, index) => {
            const firstOfThree = photoCount === 3 && index === 0;
            const cellStyle: CSSProperties | undefined =
              photoCount === 1 ? undefined : { aspectRatio: firstOfThree ? '16 / 9' : '1 / 1' };
            const imageStyle: CSSProperties | undefined =
              photoCount === 1
                ? photo.width && photo.height
                  ? {
                      height: 'auto',
                      maxHeight: '400px',
                      aspectRatio: `${photo.width} / ${photo.height}`,
                    }
                  : { height: 'auto', maxHeight: '400px' }
                : undefined;
            return (
              <a
                key={`${photo.url}-${index}`}
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className={mediaCss.mediaCell}
                style={firstOfThree ? { ...cellStyle, gridColumn: '1 / -1' } : cellStyle}
                aria-label={t('timeline.linkEmbed.open', { service: 'X' })}
                onClick={(e) => e.stopPropagation()}
              >
                <img
                  className={mediaCss.photo}
                  src={photo.url}
                  alt=""
                  loading="lazy"
                  referrerPolicy="no-referrer"
                  style={imageStyle}
                />
              </a>
            );
          })}
        </div>
      )}

      {post.video && (
        <a
          href={post.video.url ?? url}
          target="_blank"
          rel="noopener noreferrer"
          className={mediaCss.video}
          aria-label={t('timeline.linkEmbed.play', { service: 'X' })}
          onClick={(e) => e.stopPropagation()}
        >
          <img
            className={mediaCss.videoThumb}
            src={post.video.thumbnailUrl}
            alt=""
            loading="lazy"
            referrerPolicy="no-referrer"
          />
          <span className={mediaCss.videoPlay}>
            <PlayIcon size={22} weight="fill" />
          </span>
        </a>
      )}
    </>
  );
}

function XPostCard({ post, url }: { post: XPost; url: string }) {
  const { t } = useTranslation();
  return (
    <DiscordEmbed
      {...xPostEmbedData(post, url, t('timeline.linkEmbed.open', { service: 'X' }))}
      media={post.photos.length > 0 || post.video ? <XMedia post={post} url={url} /> : undefined}
      verifiedLabel={t('timeline.linkEmbed.xVerified')}
    />
  );
}

function XStatusCard({ url, message }: { url: string; message: string }) {
  const { t } = useTranslation();
  return (
    <DiscordEmbed
      {...providerEmbedData({
        service: 'x',
        url,
        description: message,
        openLabel: t('timeline.linkEmbed.open', { service: 'X' }),
      })}
    />
  );
}

/**
 * A real X post card. Show is consent, so the lookup and every picture load immediately; Ask is
 * only the prompt. A failed lookup says so instead of inventing a generic "X link".
 */
export function XPostEmbed({ url, match, mode }: XPostEmbedProps) {
  const { t } = useTranslation();
  const setMode = useSetAtom(linkEmbedModeAtoms.x);
  const statusId = match.xStatusId;

  if (mode === 'off') return null;

  if (mode === 'ask') {
    return (
      <div
        className={`${promptCss.card} ${promptCss.promptCard}`}
        style={{ borderLeftColor: '#1d9bf0' }}
      >
        <span className={promptCss.provider}>X</span>
        <span className={promptCss.promptText}>
          {t('timeline.linkEmbed.consent', { service: 'X' })}
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

  return <LoadedXPost url={url} statusId={statusId} />;
}

function LoadedXPost({ url, statusId }: { url: string; statusId: string | undefined }) {
  const { t } = useTranslation();
  const { data, isLoading } = useQuery({
    queryKey: ['xPost', statusId],
    queryFn: () => (statusId ? fetchXPost(statusId, url, false) : Promise.resolve(null)),
    enabled: !!statusId,
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    retry: false,
  });

  if (isLoading) {
    return <XStatusCard url={url} message={t('timeline.linkEmbed.xLoading')} />;
  }
  if (!data?.post) {
    return <XStatusCard url={url} message={t('timeline.linkEmbed.postFailed')} />;
  }
  return <XPostCard post={data.post} url={url} />;
}
