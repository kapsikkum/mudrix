import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { getMatrixClientOrNull } from '@/client/initMatrix';
import { useAccountData } from '@/app/data';
import { getErrorMessage } from '@/util/error';
import { useConfirm } from './useConfirm';
import { useToast } from './useToast';

export function useIgnoredUsers(): string[] {
  const content = useAccountData<{ ignored_users?: Record<string, unknown> }>(
    'm.ignored_user_list'
  );
  return useMemo(() => Object.keys(content?.ignored_users ?? {}), [content]);
}

export function useUnignoreUser() {
  const { t } = useTranslation();
  const confirmDialog = useConfirm();
  const toast = useToast();
  return useCallback(
    async (userId: string, displayName: string): Promise<void> => {
      const client = getMatrixClientOrNull();
      if (!client) return;
      const ok = await confirmDialog({
        title: t('profile.unignoreUserConfirmTitle', { name: displayName }),
        message: t('profile.unignoreUserConfirmBody', { name: displayName }),
        danger: false,
      });
      if (!ok) return;
      try {
        await client.unignoreUser(userId);
      } catch (err) {
        toast.error(t('profile.ignoreFailed', { error: getErrorMessage(err) }));
        return;
      }
      const reload = await confirmDialog({
        title: t('profile.unignoreReloadTitle'),
        message: t('profile.unignoreReloadBody', { name: displayName }),
        confirmLabel: t('profile.unignoreReloadConfirm'),
        danger: false,
      });
      if (reload) window.location.reload();
    },
    [confirmDialog, toast, t]
  );
}
