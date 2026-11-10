import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAtom } from 'jotai';
import {
  CaretUpIcon,
  CaretDownIcon,
  WarningIcon,
  EyeIcon,
  EyeSlashIcon,
} from '@phosphor-icons/react';
import { developerModeAtom, slidingSyncAtom } from '@/app/store/atoms';
import { getMatrixClientOrNull } from '@/client/initMatrix';
import { ToggleRow } from '@/app/components/Toggle';
import { CopyButton, IconButton } from '@/app/components/Button';
import { AccountDataExplorer } from './AccountDataExplorer';
import * as css from '../Settings.css';

export function DeveloperOptions() {
  const { t } = useTranslation();
  const [devModeEnabled, setDevModeEnabled] = useAtom(developerModeAtom);
  const [slidingSync, setSlidingSync] = useAtom(slidingSyncAtom);
  const client = getMatrixClientOrNull();
  const [tokenVisible, setTokenVisible] = useState(false);
  const [tokenExpanded, setTokenExpanded] = useState(false);
  const session = client?.session();
  const [wellKnownUrl, setWellKnownUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!client) return;
    let cancelled = false;
    void client
      .wellKnownHomeserverUrl()
      .catch(() => null)
      .then((url) => {
        if (!cancelled) setWellKnownUrl(url);
      });
    return () => {
      cancelled = true;
    };
  }, [client]);

  const token = session?.accessToken ?? '';
  const homeserverUrl = wellKnownUrl ?? session?.homeserverUrl ?? '';

  return (
    <div>
      <h2 className={css.panelTitle}>{t('developer.title')}</h2>

      <div className={css.section}>
        <ToggleRow
          label={t('developer.enable')}
          description={t('developer.enableDescription')}
          checked={devModeEnabled}
          onChange={setDevModeEnabled}
        />
        <ToggleRow
          label={t('settings.developer.slidingSync')}
          description={t('settings.developer.slidingSyncDescription')}
          checked={slidingSync}
          onChange={setSlidingSync}
        />
        <button
          type="button"
          className={css.actionBtnSecondary}
          onClick={() => window.location.reload()}
        >
          {t('settings.developer.reload')}
        </button>
      </div>

      {devModeEnabled && (
        <>
          <div className={css.section}>
            <button
              type="button"
              className={css.accessTokenBtn}
              onClick={() => setTokenExpanded(!tokenExpanded)}
            >
              {tokenExpanded ? <CaretUpIcon size={14} /> : <CaretDownIcon size={14} />}
              {t('developer.accessToken')}
            </button>

            {tokenExpanded && (
              <div className={css.tokenSection}>
                <div className={css.warningBox}>
                  <WarningIcon size={14} />
                  {t('developer.accessTokenWarning')}
                </div>
                <div className={css.tokenRow}>
                  <code className={css.tokenField}>
                    {tokenVisible ? token : '••••••••••••••••'}
                  </code>
                  <IconButton
                    size="sm"
                    onClick={() => setTokenVisible(!tokenVisible)}
                    aria-label={tokenVisible ? t('common.hide') : t('common.show')}
                  >
                    {tokenVisible ? <EyeSlashIcon size={14} /> : <EyeIcon size={14} />}
                  </IconButton>
                  <CopyButton text={token} />
                </div>
              </div>
            )}
          </div>

          <div className={css.divider} />

          <div className={css.section}>
            <h3 className={css.sectionTitle}>{t('developer.homeserverUrl')}</h3>
            <div className={css.tokenRow}>
              <code className={css.tokenField}>{homeserverUrl}</code>
              <CopyButton text={homeserverUrl} />
            </div>
          </div>

          {client && (
            <>
              <div className={css.divider} />
              <AccountDataExplorer client={client} />
            </>
          )}
        </>
      )}
    </div>
  );
}
