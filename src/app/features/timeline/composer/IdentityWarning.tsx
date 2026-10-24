import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { RoomStateEvent, type MatrixClient, type Room } from 'matrix-js-sdk';
import { CryptoEvent, type UserVerificationStatus } from 'matrix-js-sdk/lib/crypto-api';
import { WarningIcon } from '@phosphor-icons/react';
import { Button } from '@/app/components/Button';
import { useToast } from '@/app/hooks/useToast';
import { getErrorMessage } from '@/util/error';
import * as css from '../Composer.css';

type ViolationKind = 'reset' | 'verified';

interface Violation {
  userId: string;
  name: string;
  kind: ViolationKind;
}

function violationOf(status: UserVerificationStatus): ViolationKind | null {
  if (status.wasCrossSigningVerified() && !status.isCrossSigningVerified()) return 'verified';
  if (status.needsUserApproval) return 'reset';
  return null;
}

function roomMemberIds(room: Room, myId: string | null): string[] {
  return [...room.getMembersWithMembership('join'), ...room.getMembersWithMembership('invite')]
    .map((m) => m.userId)
    .filter((id) => id !== myId);
}

function useIdentityViolations(client: MatrixClient, roomId: string): Violation[] {
  const [violations, setViolations] = useState<Map<string, ViolationKind>>(new Map());

  useEffect(() => {
    const room = client.getRoom(roomId);
    const crypto = client.getCrypto();
    if (!room || !crypto || !room.hasEncryptionStateEvent()) {
      setViolations(new Map());
      return;
    }
    let cancelled = false;
    const myId = client.getUserId();

    const check = async (userIds: string[]) => {
      const results = await Promise.all(
        userIds.map(async (id) => {
          try {
            return [id, violationOf(await crypto.getUserVerificationStatus(id))] as const;
          } catch {
            return [id, null] as const;
          }
        })
      );
      if (cancelled) return;
      setViolations((prev) => {
        const next = new Map(prev);
        for (const [id, kind] of results) {
          if (kind) next.set(id, kind);
          else next.delete(id);
        }
        return next;
      });
    };

    setViolations(new Map());
    void check(roomMemberIds(room, myId));

    const onTrust = (userId: string, status: UserVerificationStatus) => {
      if (!roomMemberIds(room, myId).includes(userId)) return;
      setViolations((prev) => {
        const next = new Map(prev);
        const kind = violationOf(status);
        if (kind) next.set(userId, kind);
        else next.delete(userId);
        return next;
      });
    };
    const onMembers = () => {
      const ids = roomMemberIds(room, myId);
      setViolations((prev) => new Map([...prev].filter(([id]) => ids.includes(id))));
      void check(ids);
    };

    client.on(CryptoEvent.UserTrustStatusChanged as Parameters<typeof client.on>[0], onTrust);
    room.on(RoomStateEvent.Members, onMembers);
    return () => {
      cancelled = true;
      client.off(CryptoEvent.UserTrustStatusChanged as Parameters<typeof client.off>[0], onTrust);
      room.off(RoomStateEvent.Members, onMembers);
    };
  }, [client, roomId]);

  const room = client.getRoom(roomId);
  return [...violations]
    .map(([userId, kind]) => ({ userId, kind, name: room?.getMember(userId)?.name ?? userId }))
    .sort((a, b) => Number(b.kind === 'verified') - Number(a.kind === 'verified'));
}

export function IdentityWarning({ client, roomId }: { client: MatrixClient; roomId: string }) {
  const { t } = useTranslation();
  const toast = useToast();
  const violations = useIdentityViolations(client, roomId);
  const [busy, setBusy] = useState(false);
  const current = violations[0];

  const resolve = useCallback(async () => {
    const crypto = client.getCrypto();
    if (!crypto || !current) return;
    setBusy(true);
    try {
      if (current.kind === 'verified') await crypto.withdrawVerificationRequirement(current.userId);
      else await crypto.pinCurrentUserIdentity(current.userId);
    } catch (err) {
      toast.error(t('identityWarning.failed', { error: getErrorMessage(err) }));
    } finally {
      setBusy(false);
    }
  }, [client, current, toast, t]);

  if (!current) return null;

  const text =
    current.kind === 'verified'
      ? t('identityWarning.verifiedReset', { name: current.name })
      : t('identityWarning.reset', { name: current.name });

  return (
    <div className={css.identityStrip} role="status">
      <WarningIcon size={16} weight="fill" className={css.identityIcon} />
      <span className={css.identityText}>
        {text} <span className={css.statusMeta}>{current.userId}</span>
      </span>
      <Button
        size="sm"
        variant={current.kind === 'verified' ? 'danger' : 'secondary'}
        loading={busy}
        onClick={resolve}
      >
        {current.kind === 'verified' ? t('identityWarning.withdraw') : t('common.ok')}
      </Button>
    </div>
  );
}
