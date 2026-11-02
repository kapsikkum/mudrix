import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/app/components/Button';
import * as css from './SessionError.css';

interface Props {
  error: string | null;
  onRetry: () => void;
  onSignOut: () => void;
}

export function SessionError({ error, onRetry, onSignOut }: Props) {
  const { t } = useTranslation();
  const [signingOut, setSigningOut] = useState(false);

  const handleSignOut = () => {
    if (signingOut) return;
    setSigningOut(true);
    void onSignOut();
  };

  return (
    <div className={css.overlay}>
      <div className={css.box}>
        <h2 className={css.heading}>{t('auth.sessionLoadFailed')}</h2>
        {error && <pre className={css.details}>{error}</pre>}
        <div className={css.actions}>
          <Button variant="primary" onClick={onRetry} disabled={signingOut}>
            {t('common.retry')}
          </Button>
          <Button variant="secondary" onClick={handleSignOut} loading={signingOut}>
            {t('auth.signOut')}
          </Button>
        </div>
      </div>
    </div>
  );
}
