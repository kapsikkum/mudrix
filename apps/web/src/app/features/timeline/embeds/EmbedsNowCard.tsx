import { Fragment, useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { useSetAtom } from 'jotai';
import { MudrixClient } from '@mudrix/core';
import type { LinkEmbedCard } from '@/core/rpc/api.gen';
import { MediaLightbox } from '@/app/components/MediaLightbox/MediaLightbox';
import { linkEmbedModeAtoms } from '@/app/store/atoms';
import { createCardCache } from '@/util/embedsNowCache';
import {
  galleryLayout,
  sanitizeEmbedCard,
  type GalleryItem,
  type MarkdownLine,
  type SafeBlock,
  type SafeCard,
} from '@/util/embedsNowCard';
import { passiveFetchesBlocked } from '@/util/integrationFetch';
import { LINK_EMBED_SERVICE_BY_ID, type LinkEmbedServiceId } from '@/util/linkEmbeds';
import * as shellCss from './DiscordEmbed.css';
import * as css from './EmbedsNowCard.css';
import * as promptCss from './LinkEmbed.css';

const cardCache = createCardCache((url) => MudrixClient.linkEmbed(url));

/** Everything a card on screen may do to a third-party host: no referrer, no credentials. */
const MEDIA_PROPS = {
  referrerPolicy: 'no-referrer',
  loading: 'lazy',
  crossOrigin: undefined,
} as const;

function useEmbedsNowCard(url: string) {
  const [manual, setManual] = useState(false);
  const query = useQuery({
    queryKey: ['embedsNowCard', url],
    queryFn: async () => {
      if (!manual && passiveFetchesBlocked()) throw new Error('passive lookups are blocked');
      return { card: await cardCache.get(url) };
    },
    staleTime: Infinity,
    gcTime: 30 * 60 * 1000,
    retry: false,
  });
  const retry = () => {
    setManual(true);
    void query.refetch();
  };
  return { card: query.data?.card, loading: query.isPending, failed: query.isError, retry };
}

function Lines({ lines }: { lines: MarkdownLine[] }) {
  return (
    <>
      {lines.map((line, index) => (
        <p key={index} className={line.small ? `${css.line} ${css.small}` : css.line}>
          {line.segments.map((segment, i) => {
            const bold = segment.bold ? css.bold : undefined;
            if (segment.kind === 'link') {
              return (
                <a
                  key={i}
                  href={segment.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={bold ? `${css.link} ${bold}` : css.link}
                  onClick={(e) => e.stopPropagation()}
                >
                  {segment.text}
                </a>
              );
            }
            return bold ? (
              <span key={i} className={bold}>
                {segment.text}
              </span>
            ) : (
              <Fragment key={i}>{segment.text}</Fragment>
            );
          })}
        </p>
      ))}
    </>
  );
}

function Gallery({ items, hidden }: { items: GalleryItem[]; hidden: number }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState<number | null>(null);
  const images = useMemo(() => items.filter((item) => item.kind === 'image'), [items]);
  const spans = galleryLayout(items.length);

  return (
    <>
      <div className={css.gallery}>
        {items.map((item, index) => {
          const span = spans[index] ?? 2;
          const style = { gridColumn: `span ${span}` };
          if (item.kind === 'video') {
            return (
              <video
                key={`${item.url}-${index}`}
                className={css.video}
                style={{ ...style, aspectRatio: items.length > 1 ? '1 / 1' : undefined }}
                src={item.url}
                controls
                playsInline
                preload="metadata"
                aria-label={item.description ?? undefined}
                onClick={(e) => e.stopPropagation()}
              />
            );
          }
          if (item.kind === 'audio') {
            return (
              <audio
                key={`${item.url}-${index}`}
                className={css.audio}
                style={style}
                src={item.url}
                controls
                preload="metadata"
                onClick={(e) => e.stopPropagation()}
              />
            );
          }
          const single = items.length === 1;
          const cellClass = single
            ? `${css.cell} ${css.cellSingle}`
            : `${css.cell} ${span === 6 ? css.cellWide : css.cellSquare}`;
          const isLast = index === items.length - 1 && hidden > 0;
          return (
            <button
              key={`${item.url}-${index}`}
              type="button"
              className={cellClass}
              style={style}
              aria-label={item.description || t('timeline.linkEmbed.openImage')}
              onClick={(e) => {
                e.stopPropagation();
                setOpen(images.indexOf(item));
              }}
            >
              <img
                className={single ? css.pictureSingle : css.picture}
                src={item.url}
                alt={item.description ?? ''}
                {...MEDIA_PROPS}
              />
              {isLast && (
                <span className={css.more}>
                  {t('timeline.linkEmbed.moreMedia', { count: hidden })}
                </span>
              )}
            </button>
          );
        })}
      </div>
      {open !== null && images[open] && (
        <MediaLightbox
          remote
          src={images[open].url}
          items={images.map((image) => ({ src: image.url }))}
          itemIndex={open}
          onPrev={() => setOpen((i) => (i === null ? i : Math.max(0, i - 1)))}
          onNext={() => setOpen((i) => (i === null ? i : Math.min(images.length - 1, i + 1)))}
          onClose={() => setOpen(null)}
        />
      )}
    </>
  );
}

function Block({ block }: { block: SafeBlock }) {
  switch (block.type) {
    case 'text':
      return (
        <div className={css.textRow}>
          <div className={css.text}>
            <Lines lines={block.lines} />
          </div>
          {block.thumbnail && (
            <img
              className={css.avatar}
              src={block.thumbnail.url}
              alt={block.thumbnail.description ?? ''}
              {...MEDIA_PROPS}
            />
          )}
        </div>
      );
    case 'gallery':
      return <Gallery items={block.items} hidden={block.hidden} />;
    case 'separator':
      return <div className={css.separator} role="separator" />;
    case 'buttons':
      return (
        <div className={css.buttons}>
          {block.buttons.map((button) => (
            <a
              key={button.url}
              className={css.button}
              href={button.url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
            >
              {button.label}
            </a>
          ))}
        </div>
      );
  }
}

interface EmbedsNowCardViewProps {
  card: SafeCard;
  service: LinkEmbedServiceId;
  /** The link, used for the "Open on" button when the card brings none. */
  url: string;
}

/** The card itself, from already-sanitised data. Used by `EmbedsNowCard` and by fixtures. */
export function EmbedsNowCardView({ card, service, url }: EmbedsNowCardViewProps) {
  const { t } = useTranslation();
  const meta = LINK_EMBED_SERVICE_BY_ID[service];
  const hasButtons = card.blocks.some((block) => block.type === 'buttons');
  return (
    <section
      className={shellCss.shell}
      style={{ borderLeftColor: card.accent ?? meta.accent }}
      aria-label={card.service || meta.label}
    >
      <div className={css.body}>
        {card.blocks.map((block, index) => (
          <Block key={index} block={block} />
        ))}
        {!hasButtons && (
          <div className={css.buttons}>
            <a
              className={css.button}
              href={card.url ?? url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
            >
              {t('timeline.linkEmbed.open', { service: meta.label })}
            </a>
          </div>
        )}
        <span className={css.via}>{t('timeline.linkEmbed.via')}</span>
      </div>
    </section>
  );
}

function CardSkeleton({ label, accent }: { label: string; accent: string }) {
  const { t } = useTranslation();
  return (
    <section
      className={shellCss.shell}
      style={{ borderLeftColor: accent }}
      role="status"
      aria-label={t('timeline.linkEmbed.loading', { service: label })}
    >
      <div className={css.skeleton}>
        <div className={css.skeletonBar} style={{ width: '45%' }} />
        <div className={css.skeletonBar} style={{ width: '80%' }} />
        <div className={css.skeletonMedia} />
      </div>
    </section>
  );
}

interface EmbedsNowCardProps {
  url: string;
  service: LinkEmbedServiceId;
  /** What to show when there is no card: the plain homeserver preview. */
  fallback: ReactNode;
}

/**
 * A link card built by embeds.now through the app core, inside the shared Discord-style shell.
 * Only rendered when the person allowed the service and the core can reach embeds.now.
 */
export function EmbedsNowCard({ url, service, fallback }: EmbedsNowCardProps) {
  const { t } = useTranslation();
  const meta = LINK_EMBED_SERVICE_BY_ID[service];
  const { card, loading, failed, retry } = useEmbedsNowCard(url);
  const safe = useMemo(() => (card ? sanitizeEmbedCard(card as LinkEmbedCard) : null), [card]);

  if (loading) return <CardSkeleton label={meta.label} accent={meta.accent} />;
  if (failed) {
    return (
      <>
        <div className={shellCss.shell} style={{ borderLeftColor: meta.accent }}>
          <span className={css.status}>
            {t('timeline.linkEmbed.unavailable', { service: meta.label })}
          </span>
          <button type="button" className={css.retry} onClick={retry}>
            {t('common.retry')}
          </button>
        </div>
        {fallback}
      </>
    );
  }
  if (!safe || safe.blocks.length === 0) return <>{fallback}</>;
  return <EmbedsNowCardView card={safe} service={service} url={url} />;
}

/**
 * The Ask-mode choice for an embeds.now service: says plainly that embeds.now, not the service,
 * sees the link and the IP address.
 */
export function EmbedsNowPrompt({ service }: { service: LinkEmbedServiceId }) {
  const { t } = useTranslation();
  const setMode = useSetAtom(linkEmbedModeAtoms[service]);
  const meta = LINK_EMBED_SERVICE_BY_ID[service];
  return (
    <div
      className={`${promptCss.card} ${promptCss.promptCard}`}
      style={{ borderLeftColor: meta.accent }}
    >
      <span className={promptCss.provider}>{meta.label}</span>
      <span className={promptCss.promptText}>
        {t('timeline.linkEmbed.consentCard', { service: meta.label })}
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
