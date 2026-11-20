import type { ReactNode } from 'react';
import {
  ArrowUpIcon,
  ChatCircleIcon,
  HeartIcon,
  RepeatIcon,
  SealCheckIcon,
  StarIcon,
} from '@phosphor-icons/react';
import type { EmbedCardData, EmbedStatKind } from '@/util/embedCard';
import * as css from './DiscordEmbed.css';

interface DiscordEmbedProps extends EmbedCardData {
  /** A full-width picture, video or official iframe shown below the text. */
  media?: ReactNode;
  verifiedLabel?: string;
}

function StatIcon({ kind }: { kind: EmbedStatKind }) {
  const props = { size: 13, 'aria-hidden': true } as const;
  if (kind === 'like') return <HeartIcon {...props} />;
  if (kind === 'favourite') return <StarIcon {...props} />;
  if (kind === 'score') return <ArrowUpIcon {...props} />;
  if (kind === 'repost' || kind === 'boost') return <RepeatIcon {...props} />;
  return <ChatCircleIcon {...props} />;
}

/**
 * One Discord-style shell for every link embed except YouTube and Spotify: a 4px service bar,
 * an optional author row, title/description with a small floating thumbnail, large media, inline
 * fields and a muted footer. Nothing in it waits for a click.
 */
export function DiscordEmbed({
  accent,
  author,
  title,
  titleUrl,
  description,
  warning,
  thumbnailUrl,
  fields,
  footer,
  media,
  verifiedLabel,
}: DiscordEmbedProps) {
  const hasText = !!title || !!description || !!warning || !!thumbnailUrl;
  return (
    <section className={css.shell} style={{ borderLeftColor: accent }}>
      {author && (
        <div className={css.authorRow}>
          {author.iconUrl ? (
            <img
              className={css.authorIcon}
              src={author.iconUrl}
              alt=""
              loading="lazy"
              referrerPolicy="no-referrer"
            />
          ) : (
            <span className={css.authorInitial} aria-hidden="true">
              {author.name.slice(0, 1).toUpperCase()}
            </span>
          )}
          <div className={css.authorText}>
            <div className={css.authorNameRow}>
              {author.url ? (
                <a
                  href={author.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={css.authorName}
                  onClick={(e) => e.stopPropagation()}
                >
                  {author.name}
                </a>
              ) : (
                <span className={css.authorName}>{author.name}</span>
              )}
              {author.verified && (
                <span title={verifiedLabel}>
                  <SealCheckIcon className={css.verified} size={14} weight="fill" />
                </span>
              )}
            </div>
            {author.meta && <span className={css.authorMeta}>{author.meta}</span>}
          </div>
        </div>
      )}

      <div className={css.contentRow}>
        {hasText && (
          <div className={css.content}>
            {title &&
              (titleUrl ? (
                <a
                  href={titleUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={css.title}
                  onClick={(e) => e.stopPropagation()}
                >
                  {title}
                </a>
              ) : (
                <span className={css.title}>{title}</span>
              ))}
            {warning && <span className={css.warning}>{warning}</span>}
            {description && <div className={css.description}>{description}</div>}
          </div>
        )}
        {thumbnailUrl && (
          <img
            className={css.thumbnail}
            src={thumbnailUrl}
            alt=""
            loading="lazy"
            referrerPolicy="no-referrer"
          />
        )}
      </div>

      {fields && fields.length > 0 && (
        <div className={css.fields}>
          {fields.map((field) => (
            <div key={`${field.name}-${field.value}`} className={css.field}>
              <span className={css.fieldName}>{field.name}</span>
              <span className={css.fieldValue}>{field.value}</span>
            </div>
          ))}
        </div>
      )}

      {media && <div className={css.media}>{media}</div>}

      {footer && (
        <div className={css.footer}>
          <div className={css.footerLeft}>
            {footer.text && <span>{footer.text}</span>}
            {footer.stats && footer.stats.length > 0 && (
              <span className={css.footerStats}>
                {footer.stats.map((item) => (
                  <span key={item.kind} className={css.footerStat}>
                    <StatIcon kind={item.kind} />
                    {item.value}
                  </span>
                ))}
              </span>
            )}
          </div>
          <a
            href={footer.url}
            target="_blank"
            rel="noopener noreferrer"
            className={css.footerLink}
            onClick={(e) => e.stopPropagation()}
          >
            {footer.label}
          </a>
        </div>
      )}
    </section>
  );
}
