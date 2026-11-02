import { useAtom, useAtomValue } from 'jotai';
import { useTranslation } from 'react-i18next';
import { CheckCircleIcon, SpinnerGapIcon } from '@phosphor-icons/react';
import { excludeInsecureSessionsAtom, sessionVerificationAtom } from '@/app/store/atoms';
import { ToggleRow } from '@/app/components/Toggle';
import { getMatrixClientOrNull } from '@/client/initMatrix';
import { activeAccount, saveAccount } from '@/core/storage';
import { useConfirm } from '@/app/hooks/useConfirm';
import { Button } from '@/app/components/Button';
import { useSessionVerificationActions } from '@/app/features/device/useSessionVerificationActions';
import * as css from '../Settings.css';
import * as encryptionCss from './Encryption.css';

export function Encryption() {
  const { t } = useTranslation();
  const { status } = useAtomValue(sessionVerificationAtom);
  const { resetIdentity, recovery } = useSessionVerificationActions(getMatrixClientOrNull());
  const [excludeInsecure, setExcludeInsecure] = useAtom(excludeInsecureSessionsAtom);
  const confirm = useConfirm();

  const applyExcludeInsecure = async (value: boolean) => {
    const account = activeAccount();
    if (!account || (account.store.excludeInsecureDevices ?? false) === value) return;
    saveAccount({ ...account, store: { ...account.store, excludeInsecureDevices: value } });
    const reload = await confirm({
      title: t('settings.encryption.excludeInsecure'),
      message: t('settings.encryption.excludeInsecureReload'),
      confirmLabel: t('auth.reloadNow'),
      danger: false,
    });
    if (reload) window.location.reload();
  };

  return (
    <div>
      <h2 className={css.panelTitle}>{t('settings.encryption.title')}</h2>

      <div className={css.section}>
        <div className={css.settingRow}>
          <div className={css.settingInfo}>
            <span className={css.settingLabel}>{t('settings.encryption.endToEnd')}</span>
            <span className={css.settingNote}>
              {status === 'no-identity'
                ? t('settings.encryption.notSetUpNote')
                : t('settings.encryption.activeNote')}
            </span>
          </div>
          {status === 'checking' ? (
            <SpinnerGapIcon size={18} className="icon-spin" />
          ) : status === 'no-identity' ? (
            <Button variant="primary" loading={recovery.loading} onClick={resetIdentity}>
              {t('verifySession.setupButton')}
            </Button>
          ) : (
            <span className={encryptionCss.activeBadge}>
              <CheckCircleIcon size={14} weight="fill" />
              {t('settings.encryption.active')}
            </span>
          )}
        </div>
      </div>

      <div className={css.divider} />
      <div className={css.section}>
        <ToggleRow
          label={t('settings.encryption.excludeInsecure')}
          description={t('settings.encryption.excludeInsecureNote')}
          checked={excludeInsecure}
          onChange={(value) => {
            setExcludeInsecure(value);
            void applyExcludeInsecure(value);
          }}
        />
      </div>

      {status !== 'no-identity' && status !== 'checking' && (
        <>
          <div className={css.divider} />
          <div className={css.section}>
            <h3 className={css.sectionTitle}>{t('settings.encryption.reset')}</h3>
            <p className={css.settingNote}>{t('settings.encryption.resetNote')}</p>
            <div className={encryptionCss.buttonRow}>
              <Button variant="danger" loading={recovery.loading} onClick={resetIdentity}>
                {t('settings.encryption.resetButton')}
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
