import { useTranslation } from 'react-i18next';
import { Button } from '@/app/components/Button';
import * as css from './OtherTab.css';

interface Props {
  busy: boolean;
  onUse: () => void;
}

/** A second tab cannot share the account's encrypted store with the one already using it. */
export function OtherTab({ busy, onUse }: Props) {
  const { t } = useTranslation();

  return (
    <div className={css.overlay}>
      <div className={css.box}>
        <h2 className={css.heading}>{t('auth.otherTabTitle')}</h2>
        <p className={css.body}>{t('auth.otherTabBody')}</p>
        <div className={css.actions}>
          <Button variant="primary" onClick={onUse} loading={busy}>
            {busy ? t('auth.otherTabTakingOver') : t('auth.otherTabUse')}
          </Button>
        </div>
      </div>
    </div>
  );
}
