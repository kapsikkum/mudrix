import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAtomValue } from 'jotai';
import { DownloadSimpleIcon, LockOpenIcon } from '@phosphor-icons/react';
import type {
  EncryptionStatus,
  KeyRestoreProgress,
  WizardClient as MatrixClient,
} from '@wizardchat/core';
import { Button } from '@/app/components/Button';
import { useToast } from '@/app/hooks/useToast';
import { sessionVerificationAtom } from '@/app/store/atoms';
import { useSessionVerificationActions } from '@/app/features/device/useSessionVerificationActions';
import { getErrorMessage } from '@/util/error';
import * as css from '../Settings.css';
import * as statusCss from './KeyBackupStatus.css';

interface Props {
  client: MatrixClient;
}

/**
 * Whether this account's key backup exists and can be read here, and the button that fetches
 * every room key from it.
 */
export function KeyBackupStatus({ client }: Props) {
  const { t } = useTranslation();
  const toast = useToast();
  const verification = useAtomValue(sessionVerificationAtom);
  const { busy, verifyWithRecoveryKey } = useSessionVerificationActions(client);
  const [status, setStatus] = useState<EncryptionStatus | null>(null);
  const [onServer, setOnServer] = useState<boolean | null>(null);
  const [restore, setRestore] = useState<KeyRestoreProgress | null>(null);
  const [restored, setRestored] = useState<number | null>(null);
  const restoring = restore !== null;

  const refresh = useCallback(async () => {
    const [next, backup] = await Promise.all([
      client.encryptionStatus().catch(() => null),
      client.keyBackupExistsOnServer().catch(() => false),
    ]);
    setStatus(next);
    setOnServer(backup);
  }, [client]);

  useEffect(() => {
    void refresh();
  }, [refresh, verification.status]);

  const canRestore = status?.backupEnabled === true && onServer === true;
  const canUnlock = onServer === true && status?.backupEnabled === false;

  const handleRestore = async () => {
    setRestored(null);
    setRestore({ roomsDone: 0, roomsTotal: 0, keysRestored: 0 });
    try {
      const result = await client.restoreKeyBackup(setRestore);
      setRestored(result.keysRestored);
      toast.success(t('timeline.undecryptable.restored', { keys: result.keysRestored }));
      await refresh();
    } catch (err) {
      const code = (err as { code?: string } | null)?.code;
      toast.error(
        code === 'noKeyBackup'
          ? t('timeline.undecryptable.restoreNeedsKey')
          : t('timeline.undecryptable.restoreFailed', { error: getErrorMessage(err) })
      );
    } finally {
      setRestore(null);
    }
  };

  let backupLabel = t('common.loading');
  let backupTone: 'ok' | 'warn' | 'off' = 'off';
  if (onServer === false) {
    backupLabel = t('settings.keyBackup.statusNoBackup');
  } else if (status !== null) {
    if (canRestore) {
      backupLabel = t('settings.keyBackup.statusActive');
      backupTone = 'ok';
    } else {
      backupLabel = t('settings.keyBackup.statusLocked');
      backupTone = 'warn';
    }
  }

  const percent =
    restore && restore.roomsTotal > 0
      ? Math.min(100, Math.round((restore.roomsDone / restore.roomsTotal) * 100))
      : 0;

  return (
    <div className={css.section}>
      <h3 className={css.sectionTitle}>{t('settings.keyBackup.statusTitle')}</h3>
      <p className={css.settingNote}>{t('settings.keyBackup.statusDescription')}</p>

      <dl className={statusCss.rows}>
        <div className={statusCss.row}>
          <dt className={statusCss.label}>{t('settings.keyBackup.statusBackup')}</dt>
          <dd className={statusCss.value} data-tone={backupTone}>
            {backupLabel}
          </dd>
        </div>
        <div className={statusCss.row}>
          <dt className={statusCss.label}>{t('settings.keyBackup.statusThisDevice')}</dt>
          <dd className={statusCss.value} data-tone={status?.deviceVerified ? 'ok' : 'warn'}>
            {status?.deviceVerified
              ? t('settings.keyBackup.statusDeviceVerified')
              : t('settings.keyBackup.statusDeviceUnverified')}
          </dd>
        </div>
      </dl>

      {restoring && (
        <div className={statusCss.progressWrap} role="status">
          <div
            className={statusCss.progressTrack}
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent}
          >
            <div
              className={statusCss.progressBar}
              data-indeterminate={restore.roomsTotal === 0 ? '' : undefined}
              style={restore.roomsTotal === 0 ? undefined : { width: `${percent}%` }}
            />
          </div>
          <span className={css.settingNote}>
            {restore.roomsTotal === 0
              ? t('settings.keyBackup.restoreFetching')
              : t('timeline.undecryptable.restoreProgress', {
                  done: restore.roomsDone,
                  total: restore.roomsTotal,
                })}
          </span>
        </div>
      )}

      {restored !== null && !restoring && (
        <p className={css.settingNote}>
          {t('timeline.undecryptable.restored', { keys: restored })}
        </p>
      )}

      <div className={statusCss.actions}>
        {canRestore && (
          <Button
            size="sm"
            onClick={() => void handleRestore()}
            disabled={restoring}
            loading={restoring}
          >
            <DownloadSimpleIcon size={14} />
            {t('settings.keyBackup.restoreFromBackup')}
          </Button>
        )}
        {canUnlock && (
          <Button
            size="sm"
            variant="secondary"
            onClick={() => void verifyWithRecoveryKey()}
            disabled={busy !== null || restoring}
          >
            <LockOpenIcon size={14} />
            {t('settings.keyBackup.enterRecoveryKeyBtn')}
          </Button>
        )}
      </div>
    </div>
  );
}
