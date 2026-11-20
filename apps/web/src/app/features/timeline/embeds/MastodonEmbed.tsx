import type { CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { useSetAtom } from 'jotai';
import { useQuery } from '@tanstack/react-query';
import { PlayIcon } from '@phosphor-icons/react';
import { linkEmbedModeAtoms } from '@/app/store/atoms';
import { mastodonEmbedData, providerEmbedData } from '@/util/embedCard';
import type { LinkEmbedMatch, LinkEmbedMode } from '@/util/linkEmbeds';
import type { MastodonPost } from '@/util/mastodonPost';
import { fetchMastodonPost } from './mastodon';
import { DiscordEmbed } from './DiscordEmbed';
import * as mediaCss from './DiscordEmbed.css';
import * as promptCss from './LinkEmbed.css';

interface MastodonEmbedProps {
  match: LinkEmbedMatch;
  mode: LinkEmbedMode;
}

function MastodonMedia({ post }: { post: MastodonPost }) {
  const { t } = useTranslation();
  const images = post.media.filter((item) => item.type === 'image');
  const video = post.media.find((item) => item.type === 'video' || item.type === 'gifv');
  const attachments = post.media.filter((item) => item.type === 'audio' || item.type === 'unknown');
  const photoCount = images.length;

  return (
    <>
      {photoCount > 0 && (
        <div
          className={mediaCss.mediaGrid}
          style={{ gridTemplateColumns: photoCount === 1 ? '1fr' : 'repeat(2, 1fr)' }}
        >
          {images.map((photo, index) => {
            const firstOfThree = photoCount === 3 && index === 0;
            const cellStyle: CSSProperties | undefined =
              photoCount === 1 ? undefined : { aspectRatio: firstOfThree ? '16 / 9' : '1 / 1' };
            return (
              <a
                key={`${photo.url}-${index}`}
                href={post.url}
                target="_blank"
                rel="noopener noreferrer"
                className={mediaCss.mediaCell}
                style={firstOfThree ? { ...cellStyle, gridColumn: '1 / -1' } : cellStyle}
                aria-label={t('timeline.linkEmbed.open', { service: 'Mastodon' })}
                onClick={(e) => e.stopPropagation()}
              >
                <img
                  className={mediaCss.photo}
                  src={photo.url}
                  alt={photo.description ?? ''}
                  loading="lazy"
                  referrerPolicy="no-referrer"
                  style={photoCount === 1 ? { height: 'auto', maxHeight: '400px' } : undefined}
                />
              </a>
            );
          })}
        </div>
      )}

      {video && (
        <a
          href={video.url}
          target="_blank"
          rel="noopener noreferrer"
          className={mediaCss.video}
          aria-label={t('timeline.linkEmbed.play', { service: 'Mastodon' })}
          onClick={(e) => e.stopPropagation()}
        >
          <img
            className={mediaCss.videoThumb}
            src={video.previewUrl ?? video.url}
            alt={video.description ?? ''}
            loading="lazy"
            referrerPolicy="no-referrer"
          />
          <span className={mediaCss.videoPlay}>
            <PlayIcon size={22} weight="fill" />
          </span>
        </a>
      )}

      {attachments.map((item) => (
        <a
          key={item.url}
          href={item.url}
          target="_blank"
          rel="noopener noreferrer"
          className={mediaCss.footerLink}
          onClick={(e) => e.stopPropagation()}
        >
          {item.description ?? item.url}
        </a>
      ))}
    </>
  );
}

function MastodonCard({ post }: { post: MastodonPost }) {
  const { t } = useTranslation();
  return (
    <DiscordEmbed
      {...mastodonEmbedData(post, t('timeline.linkEmbed.open', { service: 'Mastodon' }))}
      media={post.media.length > 0 ? <MastodonMedia post={post} /> : undefined}
    />
  );
}

function MastodonStatusCard({ url, message }: { url: string; message: string }) {
  const { t } = useTranslation();
  return (
    <DiscordEmbed
      {...providerEmbedData({
        service: 'mastodon',
        url,
        description: message,
        openLabel: t('timeline.linkEmbed.open', { service: 'Mastodon' }),
      })}
    />
  );
}

/**
 * A Mastodon status card backed by the instance's public status API. Show is consent, so the
 * lookup happens immediately. A failed lookup says so instead of inventing a generic card.
 */
export function MastodonEmbed({ match, mode }: MastodonEmbedProps) {
  const { t } = useTranslation();
  const setMode = useSetAtom(linkEmbedModeAtoms.mastodon);
  const { data, isLoading } = useQuery({
    queryKey: ['mastodonPost', match.url],
    queryFn: () => fetchMastodonPost(match),
    enabled: mode === 'on',
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    retry: false,
  });

  if (mode === 'off') return null;

  if (mode === 'ask') {
    return (
      <div
        className={`${promptCss.card} ${promptCss.promptCard}`}
        style={{ borderLeftColor: '#6364ff' }}
      >
        <span className={promptCss.provider}>Mastodon</span>
        <span className={promptCss.promptText}>
          {t('timeline.linkEmbed.consent', { service: 'Mastodon' })}
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

  if (isLoading) {
    return <MastodonStatusCard url={match.url} message={t('timeline.linkEmbed.mastodonLoading')} />;
  }
  if (!data) {
    return <MastodonStatusCard url={match.url} message={t('timeline.linkEmbed.postFailed')} />;
  }
  return <MastodonCard post={data} />;
}
