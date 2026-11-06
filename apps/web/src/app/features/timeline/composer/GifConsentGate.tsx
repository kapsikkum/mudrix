import { useState } from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useAtomValue } from 'jotai';
import { STORAGE_KEY_GIF_SEARCH_CONSENT } from '@/const/storageKeys';
import { gifProviderAtom } from '@/app/store/atoms';
import { getGifProvider, parseGifProviderId } from './gifProviders';
import * as css from './GifPicker.css';

interface Props {
  children: ReactNode;
}

// '1' = legacy consent (Giphy only), '2' = consent covering Giphy and KLIPY.
const CONSENT_LEGACY = '1';
const CONSENT_ALL_PROVIDERS = '2';

function readConsent(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY_GIF_SEARCH_CONSENT);
  } catch {
    return null;
  }
}

export function GifConsentGate({ children }: Props) {
  const { t } = useTranslation();
  const provider = parseGifProviderId(useAtomValue(gifProviderAtom));
  const [consent, setConsent] = useState(readConsent);

  const consented =
    consent === CONSENT_ALL_PROVIDERS || (consent === CONSENT_LEGACY && provider === 'giphy');
  if (consented) return <>{children}</>;

  return (
    <div className={css.consentWrap}>
      <p className={css.consentTitle}>{t('composer.gifConsentTitle')}</p>
      <p className={css.consentBody}>
        {t('composer.gifConsentBody', {
          giphyHosts: getGifProvider('giphy').hosts.join(', '),
          klipyHosts: getGifProvider('klipy').hosts.join(', '),
        })}
      </p>
      <button
        type="button"
        className={css.consentBtn}
        onClick={() => {
          try {
            localStorage.setItem(STORAGE_KEY_GIF_SEARCH_CONSENT, CONSENT_ALL_PROVIDERS);
          } catch {
            // ignore
          }
          setConsent(CONSENT_ALL_PROVIDERS);
        }}
      >
        {t('composer.gifConsentEnable')}
      </button>
    </div>
  );
}
