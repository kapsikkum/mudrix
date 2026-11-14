import { useState } from 'react';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import { useTranslation } from 'react-i18next';
import { CheckCircleIcon, SpinnerGapIcon } from '@phosphor-icons/react';
import {
  excludeInsecureSessionsAtom,
  recoveryKeyModalAtom,
  sessionVerificationAtom,
} from '@/app/store/atoms';
import { useToast } from '@/app/hooks/useToast';
import { getErrorMessage } from '@/util/error';
import { ToggleRow } from '@/app/components/Toggle';
import { getMatrixClientOrNull } from '@/client/initMatrix';
import { activeAccount, saveAccount } from '@/core/storage';
import { useConfirm } from '@/app/hooks/useConfirm';
import { Button } from '@/app/components/Button';
import { useSessionVerificationActions } from '@/app/features/device/useSessionVerificationActions';
import { isTauriDesktop } from '@/util/desktop';
import { KeyBackupStatus } from './KeyBackupStatus';
import { RoomKeysBackup } from './RoomKeysBackup';
import * as css from '../Settings.css';
import * as encryptionCss from './Encryption.css';

export function Encryption() {
  const { t } = useTranslation();
  const { status, hasRecoveryKey } = useAtomValue(sessionVerificationAtom);
  const client = getMatrixClientOrNull();
  const { resetIdentity, recovery } = useSessionVerificationActions(client);
  const setRecoveryKeyModal = useSetAtom(recoveryKeyModalAtom);
  const toast = useToast();
  const [keyBusy, setKeyBusy] = useState(false);
  const [excludeInsecure, setExcludeInsecure] = useAtom(excludeInsecureSessionsAtom);
  const confirm = useConfirm();

  const applyExcludeInsecure = async (value: boolean) => {
    const account = activeAccount();
    if (!account || (account.store.excludeInsecureDevices ?? false) === value) return;
    saveAccount({ ...account, store: { ...account.store, excludeInsecureDevices: value } });
    const reload = await confirm({
      title: t('settings.encryption.excludeInsecure'),
      message: t('settings.encryption.excludeInsecureReload'),
      confirmLabel: t('common.reloadNow'),
      danger: false,
    });
    if (reload) window.location.reload();
  };

  const createRecoveryKey = async () => {
    if (!client) return;
    if (hasRecoveryKey) {
      const ok = await confirm({
        title: t('settings.encryption.changeRecoveryKey'),
        message: t('settings.encryption.changeRecoveryKeyConfirm'),
        confirmLabel: t('settings.encryption.changeRecoveryKey'),
        danger: true,
      });
      if (!ok) return;
    }
    setKeyBusy(true);
    try {
      const key = hasRecoveryKey ? await client.resetRecoveryKey() : await client.enableRecovery();
      setRecoveryKeyModal({ open: true, recoveryKey: key, isRegenerating: hasRecoveryKey });
    } catch (err) {
      toast.error(t('settings.keyBackup.setupFailed', { error: getErrorMessage(err) }));
    } finally {
      setKeyBusy(false);
    }
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
              {t('verification.session.setupButton')}
            </Button>
          ) : (
            <span className={encryptionCss.activeBadge}>
              <CheckCircleIcon size={14} weight="fill" />
              {t('settings.encryption.active')}
            </span>
          )}
        </div>
      </div>

      {status === 'verified' && (
        <>
          <div className={css.divider} />
          <div className={css.section}>
            <div className={css.settingRow}>
              <div className={css.settingInfo}>
                <span className={css.settingLabel}>{t('settings.encryption.recoveryKey')}</span>
                <span className={css.settingNote}>
                  {hasRecoveryKey
                    ? t('settings.encryption.recoveryKeyActiveNote')
                    : t('settings.encryption.recoveryKeyMissingNote')}
                </span>
              </div>
              <Button
                variant={hasRecoveryKey ? 'secondary' : 'primary'}
                loading={keyBusy}
                onClick={() => void createRecoveryKey()}
              >
                {hasRecoveryKey
                  ? t('settings.encryption.changeRecoveryKey')
                  : t('settings.encryption.setUpRecoveryKey')}
              </Button>
            </div>
          </div>
        </>
      )}

      {client && status !== 'no-identity' && status !== 'checking' && (
        <>
          <div className={css.divider} />
          <KeyBackupStatus client={client} />
        </>
      )}

      {client &&
        isTauriDesktop() &&
        !!window.desktopAPI?.pickKeyFileToSave &&
        status !== 'no-identity' &&
        status !== 'checking' && (
          <>
            <div className={css.divider} />
            <RoomKeysBackup client={client} />
          </>
        )}

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
