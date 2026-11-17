import { useAtomValue } from 'jotai';
import { useTranslation } from 'react-i18next';
import { callActionsAtom } from '@/app/store/atoms/call';
import * as css from './ScreenShareNotice.css';

/** Slim "you're sharing your screen" line with a Stop button, shown over the call while sharing. */
export function ScreenShareNotice() {
  const { t } = useTranslation();
  const actions = useAtomValue(callActionsAtom);
  if (!actions) return null;

  return (
    <div className={css.notice} role="status">
      <span className={css.dot} aria-hidden="true" />
      <span className={css.label}>{t('call.youAreSharing')}</span>
      <button type="button" className={css.stopButton} onClick={() => actions.toggleScreenshare()}>
        {t('call.stopShare')}
      </button>
    </div>
  );
}
