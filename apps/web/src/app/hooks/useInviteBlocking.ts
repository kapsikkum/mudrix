import { useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { WizardClient as MatrixClient } from '@wizardchat/core';
import { useAccountData } from '@/app/data';
import { matrixErrcode } from '@/app/features/auth/matrixError';

const STABLE_TYPE = 'm.invite_permission_config';
const UNSTABLE_TYPE = 'org.matrix.msc4380.invite_permission_config';

async function resolveEventType(client: MatrixClient): Promise<string | null> {
  const { unstableFeatures } = await client.serverFeatures();
  if (unstableFeatures.includes('org.matrix.msc4380.stable')) return STABLE_TYPE;
  if (unstableFeatures.includes('org.matrix.msc4380')) return UNSTABLE_TYPE;
  return null;
}

export function useInviteBlocking(client: MatrixClient | null) {
  const { data: eventType } = useQuery({
    queryKey: ['invite-blocking-support'],
    queryFn: () => resolveEventType(client!),
    enabled: !!client,
    staleTime: Infinity,
  });
  const content = useAccountData<{ default_action?: unknown }>(eventType ?? STABLE_TYPE);

  const setBlocked = useCallback(
    async (blocked: boolean) => {
      if (!client || !eventType) return;
      await client.setAccountData(eventType, blocked ? { default_action: 'block' } : {});
    },
    [client, eventType]
  );

  return {
    supported: !!eventType,
    blocked: !!eventType && content?.default_action === 'block',
    setBlocked,
  };
}

const INVITE_BLOCKED_CODES = ['M_INVITE_BLOCKED', 'ORG.MATRIX.MSC4155.INVITE_BLOCKED'];

export function isInviteBlockedError(error: unknown): boolean {
  const errcode = matrixErrcode(error);
  return !!errcode && INVITE_BLOCKED_CODES.includes(errcode);
}
