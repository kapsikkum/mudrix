import { useState, useEffect, useCallback } from 'react';
import { useSetAtom } from 'jotai';
import { useTranslation } from 'react-i18next';
import type { WizardClient as MatrixClient } from '@wizardchat/core';
import { useToast } from '@/app/hooks/useToast';
import { getErrorMessage } from '@/util/error';
import { resetIdentityWithUia } from '@/app/features/keybackup/crossSigningUia';
import {
  getEncryptionSetupStatus,
  hasExistingEncryptionSetup,
} from '@/app/features/keybackup/cryptoStatus';
import { recoveryKeyModalAtom, crossSigningUiaAtom } from '@/app/store/atoms';
import { useConfirm } from '@/app/hooks/useConfirm';

export type BackupMode = 'loading' | 'none' | 'available' | 'active';

async function fetchBackupMode(client: MatrixClient): Promise<BackupMode> {
  const [status, onServer] = await Promise.all([
    client.encryptionStatus(),
    client.keyBackupExistsOnServer(),
  ]);
  if (!onServer) return 'none';
  return status.backupEnabled ? 'active' : 'available';
}

export function useRecoveryKeyActions(client: MatrixClient | null) {
  const { t } = useTranslation();
  const toast = useToast();
  const setRecoveryKeyModal = useSetAtom(recoveryKeyModalAtom);
  const confirmDialog = useConfirm();
  const setCrossSigningUia = useSetAtom(crossSigningUiaAtom);

  const [mode, setMode] = useState<BackupMode>('loading');
  const [loading, setLoading] = useState(false);

  const refreshStatus = useCallback(async () => {
    if (!client) return;
    setMode('loading');
    try {
      setMode(await fetchBackupMode(client));
    } catch {
      setMode('none');
    }
  }, [client]);

  useEffect(() => {
    refreshStatus();
  }, [refreshStatus]);

  const confirm = useCallback(
    (title: string, message: string, danger = false): Promise<boolean> =>
      confirmDialog({ title, message, danger }),
    [confirmDialog]
  );

  const handleSetup = useCallback(async () => {
    if (!client) return;

    try {
      const status = await getEncryptionSetupStatus(client);
      if (hasExistingEncryptionSetup(status)) {
        const ok = await confirm(
          t('crypto.setupOverwritesTitle'),
          t('crypto.setupOverwritesConfirm'),
          true
        );
        if (!ok) return;
      }
    } catch {
      const ok = await confirm(
        t('crypto.setupOverwritesTitle'),
        t('crypto.setupOverwritesConfirm'),
        true
      );
      if (!ok) return;
    }

    setLoading(true);
    try {
      try {
        await resetIdentityWithUia(client, setCrossSigningUia, t);
      } catch (crossSigningErr) {
        if (crossSigningErr instanceof Error && crossSigningErr.message === 'UIA cancelled') {
          throw crossSigningErr;
        }
        toast.error(
          t('settings.keyBackup.crossSigningFailed', {
            error: getErrorMessage(crossSigningErr),
          })
        );
      }

      const encodedKey = await client.enableRecovery();
      if (!encodedKey) throw new Error(t('settings.keyBackup.couldNotGenerateKey'));

      setRecoveryKeyModal({ open: true, recoveryKey: encodedKey, isRegenerating: false });
      await refreshStatus();
      toast.success(t('settings.keyBackup.setupSuccess'));
    } catch (err) {
      toast.error(t('settings.keyBackup.setupFailed', { error: getErrorMessage(err) }));
    } finally {
      setLoading(false);
    }
  }, [client, t, toast, confirm, setCrossSigningUia, setRecoveryKeyModal, refreshStatus]);

  return {
    loading,
    mode,
    refreshStatus,
    handleSetup,
  };
}
