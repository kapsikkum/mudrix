import { useState, useEffect, useCallback } from 'react';
import { useSetAtom } from 'jotai';
import { useTranslation } from 'react-i18next';
import type { MatrixClient } from 'matrix-js-sdk';
import type {
  CryptoApi,
  CryptoCallbacks,
  GeneratedSecretStorageKey,
} from 'matrix-js-sdk/lib/crypto-api';
import type { UIAuthCallback } from 'matrix-js-sdk/lib/interactive-auth';
import { useToast } from '@/app/hooks/useToast';
import { getErrorMessage } from '@/util/error';
import { buildCrossSigningUiaCallback as buildCrossSigningUiaCallbackShared } from '@/app/features/keybackup/crossSigningUia';
import {
  getEncryptionSetupStatus,
  hasExistingEncryptionSetup,
} from '@/app/features/keybackup/cryptoStatus';
import { recoveryKeyModalAtom, crossSigningUiaAtom } from '@/app/store/atoms';
import { useConfirm } from '@/app/hooks/useConfirm';

export function makeSecretStorageKeyCallback(
  client: MatrixClient,
  privateKey: Uint8Array
): NonNullable<CryptoCallbacks['getSecretStorageKey']> {
  return async ({ keys }) => {
    const key = privateKey as Uint8Array<ArrayBuffer>;
    const defaultKeyId = await client.secretStorage.getDefaultKeyId();

    const matchingKeyIds: string[] = [];
    for (const [keyId, keyInfo] of Object.entries(keys)) {
      if (await client.secretStorage.checkKey(key, keyInfo)) {
        matchingKeyIds.push(keyId);
      }
    }

    if (matchingKeyIds.length === 0) return null;

    const keyId =
      defaultKeyId && matchingKeyIds.includes(defaultKeyId) ? defaultKeyId : matchingKeyIds[0];
    return [keyId, key];
  };
}

export type BackupMode = 'loading' | 'none' | 'available' | 'active';

interface BackupStatus {
  mode: BackupMode;
  serverVersion: string | null;
  activeVersion: string | null;
}

async function fetchBackupStatus(crypto: CryptoApi): Promise<BackupStatus> {
  const [activeVersion, serverInfo] = await Promise.all([
    crypto.getActiveSessionBackupVersion(),
    crypto.getKeyBackupInfo(),
  ]);

  const serverVersion = serverInfo?.version ?? null;

  let mode: BackupMode;
  if (!serverVersion) {
    mode = 'none';
  } else if (activeVersion) {
    mode = 'active';
  } else {
    mode = 'available';
  }

  return { mode, serverVersion, activeVersion };
}

export function useRecoveryKeyActions(client: MatrixClient | null) {
  const { t } = useTranslation();
  const toast = useToast();
  const setRecoveryKeyModal = useSetAtom(recoveryKeyModalAtom);
  const confirmDialog = useConfirm();
  const setCrossSigningUia = useSetAtom(crossSigningUiaAtom);

  const [status, setStatus] = useState<BackupStatus>({
    mode: 'loading',
    serverVersion: null,
    activeVersion: null,
  });
  const [loading, setLoading] = useState(false);

  const refreshStatus = useCallback(async () => {
    if (!client) return;
    const crypto = client.getCrypto();
    if (!crypto) return;
    setStatus((s) => ({ ...s, mode: 'loading' }));
    try {
      setStatus(await fetchBackupStatus(crypto));
    } catch {
      setStatus({ mode: 'none', serverVersion: null, activeVersion: null });
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

  const buildCrossSigningUiaCallback = useCallback((): UIAuthCallback<void> => {
    if (!client) throw new Error('No client');
    return buildCrossSigningUiaCallbackShared(client, setCrossSigningUia, t);
  }, [client, setCrossSigningUia, t]);

  const handleSetup = useCallback(async () => {
    if (!client) return;
    const crypto: CryptoApi | undefined = client.getCrypto();
    if (!crypto) {
      toast.error(t('settings.keyBackup.cryptoNotAvailable'));
      return;
    }

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
      const keyData: GeneratedSecretStorageKey = await crypto.createRecoveryKeyFromPassphrase();
      const encodedKey: string | undefined = keyData.encodedPrivateKey;
      if (!encodedKey) throw new Error(t('settings.keyBackup.couldNotGenerateKey'));

      const callbacks: CryptoCallbacks = client.cryptoCallbacks;
      callbacks.getSecretStorageKey = makeSecretStorageKeyCallback(client, keyData.privateKey);
      callbacks.cacheSecretStorageKey = () => {};

      await crypto.bootstrapSecretStorage({
        setupNewSecretStorage: true,
        setupNewKeyBackup: true,
        createSecretStorageKey: async () => keyData,
      });

      try {
        await crypto.bootstrapCrossSigning({
          setupNewCrossSigning: true,
          authUploadDeviceSigningKeys: buildCrossSigningUiaCallback(),
        });
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

      await crypto.checkKeyBackupAndEnable();

      setRecoveryKeyModal({ open: true, recoveryKey: encodedKey, isRegenerating: false });
      await refreshStatus();
      toast.success(t('settings.keyBackup.setupSuccess'));
    } catch (err) {
      toast.error(t('settings.keyBackup.setupFailed', { error: getErrorMessage(err) }));
    } finally {
      setLoading(false);
    }
  }, [client, t, toast, confirm, buildCrossSigningUiaCallback, setRecoveryKeyModal, refreshStatus]);

  return {
    loading,
    mode: status.mode,
    refreshStatus,
    handleSetup,
  };
}
