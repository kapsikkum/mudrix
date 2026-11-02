import { useState } from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { STORAGE_KEY_GIF_SEARCH_CONSENT } from '@/const/storageKeys';
import * as css from './GifPicker.css';

interface Props {
  children: ReactNode;
}

export function GifConsentGate({ children }: Props) {
  const { t } = useTranslation();
  const [consented, setConsented] = useState(
    () => localStorage.getItem(STORAGE_KEY_GIF_SEARCH_CONSENT) === '1'
  );

  if (consented) return <>{children}</>;

  return (
    <div className={css.consentWrap}>
      <p className={css.consentTitle}>{t('composer.gifConsentTitle')}</p>
      <p className={css.consentBody}>{t('composer.gifConsentBody')}</p>
      <button
        type="button"
        className={css.consentBtn}
        onClick={() => {
          localStorage.setItem(STORAGE_KEY_GIF_SEARCH_CONSENT, '1');
          setConsented(true);
        }}
      >
        {t('composer.gifConsentEnable')}
      </button>
    </div>
  );
}
