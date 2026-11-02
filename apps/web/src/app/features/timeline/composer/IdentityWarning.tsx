import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { IdentityChange, WizardClient as MatrixClient } from '@wizardchat/core';
import { WarningIcon } from '@phosphor-icons/react';
import { Button } from '@/app/components/Button';
import { useToast } from '@/app/hooks/useToast';
import { useMembers, useRoom } from '@/app/data';
import { getErrorMessage } from '@/util/error';
import * as css from '../Composer.css';

type ViolationKind = 'reset' | 'verified';

interface Violation {
  userId: string;
  name: string;
  kind: ViolationKind;
}

function violationOf(state: IdentityChange['state']): ViolationKind | null {
  if (state === 'verificationViolation') return 'verified';
  if (state === 'pinViolation') return 'reset';
  return null;
}

function useIdentityViolations(client: MatrixClient, roomId: string): Violation[] {
  const [violations, setViolations] = useState<Map<string, ViolationKind>>(new Map());
  const encrypted = useRoom(roomId)?.isEncrypted ?? false;
  const { data: members } = useMembers(roomId);

  useEffect(() => {
    setViolations(new Map());
    if (!encrypted) return;
    const myId = client.userId();
    const subscription = client.watchIdentityChanges(roomId, (changes) => {
      setViolations((prev) => {
        const next = new Map(prev);
        for (const { userId, state } of changes) {
          if (userId === myId) continue;
          const kind = violationOf(state);
          if (kind) next.set(userId, kind);
          else next.delete(userId);
        }
        return next;
      });
    });
    return () => subscription.cancel();
  }, [client, roomId, encrypted]);

  return [...violations]
    .map(([userId, kind]) => ({
      userId,
      kind,
      name: members?.find((m) => m.userId === userId)?.displayName ?? userId,
    }))
    .sort((a, b) => Number(b.kind === 'verified') - Number(a.kind === 'verified'));
}

export function IdentityWarning({ client, roomId }: { client: MatrixClient; roomId: string }) {
  const { t } = useTranslation();
  const toast = useToast();
  const violations = useIdentityViolations(client, roomId);
  const [busy, setBusy] = useState(false);
  const current = violations[0];

  const resolve = useCallback(async () => {
    if (!current) return;
    setBusy(true);
    try {
      await client.acknowledgeIdentity(current.userId);
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
