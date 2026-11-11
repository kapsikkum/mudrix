import { useCallback, useState } from 'react';
import { useSetAtom } from 'jotai';
import { useTranslation } from 'react-i18next';
import type { WizardClient as MatrixClient } from '@wizardchat/core';
import {
  emojiVerificationAtom,
  enterRecoveryKeyModalAtom,
  sessionVerificationAtom,
} from '@/app/store/atoms';
import { useToast } from '@/app/hooks/useToast';
import { getErrorMessage } from '@/util/error';
import { useRecoveryKeyActions } from '@/app/features/settings/sessions/useRecoveryKeyActions';
import {
  applyRecoveryKey,
  evaluateSessionVerification,
  startSelfVerification,
} from './sessionVerification';

export type SessionVerificationBusy = 'device' | 'key' | null;

export function useSessionVerificationActions(client: MatrixClient | null) {
  const { t } = useTranslation();
  const toast = useToast();
  const setEmojiModal = useSetAtom(emojiVerificationAtom);
  const setEnterKeyModal = useSetAtom(enterRecoveryKeyModalAtom);
  const setVerification = useSetAtom(sessionVerificationAtom);
  const recovery = useRecoveryKeyActions(client);
  const [busy, setBusy] = useState<SessionVerificationBusy>(null);

  const refresh = useCallback(async () => {
    if (!client) return;
    const next = await evaluateSessionVerification(client).catch(() => null);
    if (next) setVerification(next);
  }, [client, setVerification]);

  const verifyWithOtherDevice = useCallback(async () => {
    if (!client) return;
    setBusy('device');
    try {
      await startSelfVerification(client, setEmojiModal);
    } catch (err) {
      toast.error(t('verification.session.failed', { error: getErrorMessage(err) }));
    } finally {
      setBusy(null);
    }
  }, [client, setEmojiModal, toast, t]);

  const verifyWithRecoveryKey = useCallback(async () => {
    if (!client) return;
    const key = await new Promise<string | null>((resolve) =>
      setEnterKeyModal({ open: true, resolve })
    );
    if (!key) return;
    setBusy('key');
    try {
      const result = await applyRecoveryKey(client, key);
      if (result === 'verified') toast.success(t('verification.session.verified'));
      else if (result === 'backup-only') toast.success(t('verification.session.backupOnly'));
      else if (result === 'invalid-key') toast.error(t('verification.session.invalidKey'));
      else toast.error(t('verification.session.noIdentityBackup'));
      await Promise.all([refresh(), recovery.refreshStatus()]);
    } catch (err) {
      toast.error(t('verification.session.failed', { error: getErrorMessage(err) }));
    } finally {
      setBusy(null);
    }
  }, [client, setEnterKeyModal, toast, t, refresh, recovery]);

  const { handleSetup } = recovery;
  const resetIdentity = useCallback(async () => {
    await handleSetup();
    await refresh();
  }, [handleSetup, refresh]);

  return {
    busy,
    verifyWithOtherDevice,
    verifyWithRecoveryKey,
    resetIdentity,
    recovery,
  };
}
