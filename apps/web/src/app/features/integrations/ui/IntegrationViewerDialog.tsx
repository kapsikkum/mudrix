import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { SpinnerGapIcon } from '@phosphor-icons/react';
import { Dialog } from '@/app/components/Dialog/Dialog';
import { zIndex } from '@/theme/zIndex';
import type { LinkViewer } from '../matching';
import { WIDGET_ALLOW, assertViewerUrlAllowed, widgetSandbox } from '../widget';
import * as css from './IntegrationWidgetDialog.css';

interface Props {
  viewer: LinkViewer;
  /** The link on the card. Checked again right here, against the approved host. */
  url: string;
  title: string;
  onClose: () => void;
}

/**
 * Shows the page behind a card's link in a sandboxed frame. It is only created when the person
 * presses the card's button; it gets no Widget API and no room, only the page and (if the
 * integration was approved for it) the right to start downloads.
 */
export function IntegrationViewerDialog({ viewer, url, title, onClose }: Props) {
  const { t } = useTranslation();
  const [loaded, setLoaded] = useState(false);
  const [check] = useState(() => assertViewerUrlAllowed(viewer.widgetUrl, url));
  const host = (() => {
    try {
      return new URL(url).host;
    } catch {
      return '';
    }
  })();
  const name = viewer.integrationName;

  return (
    <Dialog
      open
      onClose={onClose}
      title={title}
      size="xl"
      zIndex={zIndex.overlay}
      maxWidth="900px"
      height="80vh"
      fullscreenOnMobile
      bodyClassName={css.dialogBody}
    >
      <div className={css.notice}>
        <span className={css.codeBadge}>{t('integrations.widget.badge')}</span>
        <span>{t('integrations.widget.codeFrom', { host: host || '?' })}</span>
      </div>
      {!check.ok ? (
        <div className={css.errorState} role="alert">
          {check.error}
        </div>
      ) : (
        <div className={css.frameWrap}>
          {!loaded && (
            <div className={css.loading} role="status">
              <SpinnerGapIcon size={20} className="icon-spin" />
              <span>{t('common.loading')}</span>
            </div>
          )}
          <iframe
            className={css.iframe}
            src={url}
            sandbox={widgetSandbox(viewer.saveFiles)}
            allow={WIDGET_ALLOW}
            referrerPolicy="no-referrer"
            title={t('integrations.widget.frameTitle', { name, host })}
            onLoad={() => setLoaded(true)}
          />
        </div>
      )}
    </Dialog>
  );
}
