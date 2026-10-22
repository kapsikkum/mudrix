import { useCallback, useState } from 'react';
import { EventType, type MatrixClient, type MatrixEvent } from 'matrix-js-sdk';
import { useTranslation } from 'react-i18next';
import { clearSyncCacheAndReload } from '@/client/initMatrix';
import { getErrorMessage } from '@/util/error';
import { useMatrixEvent } from './useMatrixEvent';
import { useConfirm } from './useConfirm';
import { useToast } from './useToast';

export function useIgnoredUsers(client: MatrixClient | null): string[] {
  const [ignored, setIgnored] = useState<string[]>(() => client?.getIgnoredUsers() ?? []);
  const onAccountData = useCallback(
    (event: MatrixEvent) => {
      if (event.getType() === EventType.IgnoredUserList) {
        setIgnored(client?.getIgnoredUsers() ?? []);
      }
    },
    [client]
  );
  useMatrixEvent(client, 'accountData', onAccountData);
  return ignored;
}

export function useUnignoreUser(client: MatrixClient | null) {
  const { t } = useTranslation();
  const confirmDialog = useConfirm();
  const toast = useToast();

  return useCallback(
    async (userId: string, displayName: string): Promise<void> => {
      if (!client) return;
      const ok = await confirmDialog({
        title: t('profile.unignoreUserConfirmTitle', { name: displayName }),
        message: t('profile.unignoreUserConfirmBody', { name: displayName }),
        danger: false,
      });
      if (!ok) return;
      try {
        await client.setIgnoredUsers(client.getIgnoredUsers().filter((id) => id !== userId));
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
      if (reload) await clearSyncCacheAndReload(client);
    },
    [client, confirmDialog, toast, t]
  );
}
