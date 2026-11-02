import { useState, useEffect } from 'react';
import { getMatrixClientOrNull } from '@/client/initMatrix';

export interface AccountManagementState {
  canChangePassword: boolean;
  canChangeThreePids: boolean;
  accountManagementUrl: string | null;
  loading: boolean;
}

export function useAccountManagement(): AccountManagementState {
  const client = getMatrixClientOrNull();
  const [state, setState] = useState<AccountManagementState>({
    canChangePassword: true,
    canChangeThreePids: true,
    accountManagementUrl: null,
    loading: true,
  });

  useEffect(() => {
    if (!client) return;

    const load = async () => {
      const result: AccountManagementState = {
        canChangePassword: true,
        canChangeThreePids: true,
        accountManagementUrl: null,
        loading: false,
      };

      try {
        const caps = await client.serverCapabilities();
        result.canChangePassword = caps.changePassword;
        result.canChangeThreePids = caps.change3pid;
      } catch {
        // assume password change is available by default
      }

      try {
        result.accountManagementUrl = (await client.accountManagementUrl()) ?? null;
      } catch {
        // ignore
      }

      setState(result);
    };

    load();
  }, [client]);

  return state;
}
