import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/app/components/Button';
import { hostOf } from '../widget';
import type { IntegrationCardData } from './useIntegrationCards';
import { useLinkDetails, type LinkDetailsState } from './useLinkDetails';
import { IntegrationViewerDialog } from './IntegrationViewerDialog';
import * as css from './IntegrationCard.css';

/** Host plus a shortened tail of the link (the part after the host can be a long secret code). */
function shortLink(url: string): string {
  try {
    const u = new URL(url);
    const tail = `${u.pathname === '/' ? '' : u.pathname}${u.search}${u.hash}`;
    const short = tail.length > 30 ? `${tail.slice(0, 20)}…${tail.slice(-6)}` : tail;
    return `${u.host}${short}`;
  } catch {
    return '';
  }
}

/** What the lookup found: plain text nodes only, nothing from the answer is a link or markup. */
function DetailsBlock({ state }: { state: LinkDetailsState }) {
  const { t } = useTranslation();
  if (state.status === 'ask') {
    return (
      <button
        type="button"
        className={css.askButton}
        onClick={(e) => {
          e.stopPropagation();
          state.load();
        }}
      >
        {t('integrations.card.loadDetails', { host: state.host })}
      </button>
    );
  }
  if (state.status === 'paused') {
    return <span className={css.note}>{t('integrations.card.paused', { host: state.host })}</span>;
  }
  if (state.status === 'failed' && state.requested) {
    return (
      <span className={css.note}>{t('integrations.card.noDetails', { host: state.host })}</span>
    );
  }
  if (state.status !== 'ready') return null;
  const { description, facts } = state.details;
  return (
    <>
      {description && <span className={css.description}>{description}</span>}
      {facts.length > 0 && (
        <span className={css.facts}>
          {facts.map((f, i) => (
            <span key={i} className={css.fact}>
              <span className={css.factLabel}>{f.label}</span> {f.value}
            </span>
          ))}
        </span>
      )}
    </>
  );
}

/**
 * Rule texts are plain text nodes only. The icon, when an older profile stored one, is a locally
 * kept data URL; this app does not download icons.
 */
export function IntegrationCard({
  card,
  isEncrypted,
}: {
  card: IntegrationCardData;
  isEncrypted: boolean;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const { rule, viewer } = card;
  const details = useLinkDetails(card, isEncrypted);
  const icon = card.iconDataUrl?.startsWith('data:image/') ? card.iconDataUrl : undefined;
  const title = (details.status === 'ready' && details.details.title) || card.title;
  const via =
    details.status === 'ready'
      ? t('integrations.card.viaDetails', { name: card.integrationName, host: details.host })
      : t('integrations.card.via', { name: card.integrationName });
  const openLink = (
    <a
      href={card.url}
      target="_blank"
      rel="noopener noreferrer"
      className={css.button}
      onClick={(e) => e.stopPropagation()}
    >
      {rule.buttonLabel ||
        (viewer ? t('integrations.card.openInBrowser') : t('integrations.card.open'))}
    </a>
  );

  if (!viewer && !card.lookup) {
    return (
      <div className={css.card}>
        {icon && <img src={icon} alt="" className={css.icon} />}
        <div className={css.text}>
          <span className={css.title}>{title}</span>
          {card.subtitle && <span className={css.subtitle}>{card.subtitle}</span>}
          <span className={css.via}>{via}</span>
        </div>
        {openLink}
      </div>
    );
  }

  const host = hostOf(card.url);
  const label = viewer ? viewer.label || t('integrations.card.openHere') : '';
  return (
    <div className={css.cardRich}>
      <div className={css.richHeader}>
        {icon && <img src={icon} alt="" className={css.icon} />}
        <div className={css.text}>
          <span className={css.title}>{title}</span>
          {card.subtitle && <span className={css.subtitle}>{card.subtitle}</span>}
        </div>
      </div>
      <DetailsBlock state={details} />
      {viewer && (
        <>
          <code className={css.linkLine} title={host}>
            {shortLink(card.url)}
          </code>
          <span className={css.note}>{t('integrations.card.nothingLoaded', { host, label })}</span>
        </>
      )}
      <div className={css.actions}>
        {viewer && (
          <Button
            variant="primary"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              setOpen(true);
            }}
          >
            {label}
          </Button>
        )}
        {openLink}
        <span className={css.via}>{via}</span>
      </div>
      {viewer && open && (
        <IntegrationViewerDialog
          viewer={viewer}
          url={card.url}
          title={card.title}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  );
}

export function IntegrationCards({
  cards,
  isEncrypted,
}: {
  cards: IntegrationCardData[];
  isEncrypted: boolean;
}) {
  return (
    <>
      {cards.map((c) => (
        <IntegrationCard key={c.url} card={c} isEncrypted={isEncrypted} />
      ))}
    </>
  );
}
