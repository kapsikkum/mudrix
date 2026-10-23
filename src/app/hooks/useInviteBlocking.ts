import { useCallback, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { MatrixClient, MatrixEvent } from 'matrix-js-sdk';
import { useMatrixEvent } from './useMatrixEvent';

const STABLE_TYPE = 'm.invite_permission_config';
const UNSTABLE_TYPE = 'org.matrix.msc4380.invite_permission_config';

type AccountDataType = Parameters<MatrixClient['getAccountData']>[0];

async function resolveEventType(client: MatrixClient): Promise<string | null> {
  if (await client.doesServerSupportUnstableFeature('org.matrix.msc4380.stable')) {
    return STABLE_TYPE;
  }
  if (await client.doesServerSupportUnstableFeature('org.matrix.msc4380')) return UNSTABLE_TYPE;
  return null;
}

function readBlocked(client: MatrixClient | null, type: string | null | undefined): boolean {
  if (!client || !type) return false;
  return client.getAccountData(type as AccountDataType)?.getContent()?.default_action === 'block';
}

export function useInviteBlocking(client: MatrixClient | null) {
  const { data: eventType } = useQuery({
    queryKey: ['invite-blocking-support'],
    queryFn: () => resolveEventType(client!),
    enabled: !!client,
    staleTime: Infinity,
  });
  const [revision, setRevision] = useState(0);
  void revision;

  const onAccountData = useCallback(
    (event: MatrixEvent) => {
      if (event.getType() === eventType) setRevision((r) => r + 1);
    },
    [eventType]
  );
  useMatrixEvent(client, 'accountData', onAccountData);

  const setBlocked = useCallback(
    async (blocked: boolean) => {
      if (!client || !eventType) return;
      await client.setAccountData(
        eventType as Parameters<MatrixClient['setAccountData']>[0],
        (blocked ? { default_action: 'block' } : {}) as never
      );
    },
    [client, eventType]
  );

  return { supported: !!eventType, blocked: readBlocked(client, eventType), setBlocked };
}

export function isInviteBlockedError(error: unknown): boolean {
  const errcode = (error as { errcode?: unknown } | null)?.errcode;
  return errcode === 'M_INVITE_BLOCKED' || errcode === 'ORG.MATRIX.MSC4155.INVITE_BLOCKED';
}
