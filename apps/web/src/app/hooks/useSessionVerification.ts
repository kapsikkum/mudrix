import { useEffect } from 'react';
import { useSetAtom } from 'jotai';
import type { WizardClient as MatrixClient } from '@wizardchat/core';
import { sessionVerificationAtom } from '@/app/store/atoms';
import { evaluateSessionVerification } from '@/app/features/device/sessionVerification';

const INITIAL_DELAY_MS = 2500;
const RETRY_DELAY_MS = 5000;

export function useSessionVerification(client: MatrixClient | null, syncReady: boolean) {
  const setState = useSetAtom(sessionVerificationAtom);

  useEffect(() => {
    if (!client || !syncReady) return;

    let cancelled = false;
    let initialReady = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    const evaluate = async () => {
      if (retryTimer) clearTimeout(retryTimer);
      retryTimer = null;
      try {
        const next = await evaluateSessionVerification(client);
        if (cancelled) return;
        if (next) setState(next);
        else retryTimer = setTimeout(evaluate, RETRY_DELAY_MS);
      } catch {
        if (!cancelled) retryTimer = setTimeout(evaluate, RETRY_DELAY_MS);
      }
    };

    const initialTimer = setTimeout(() => {
      initialReady = true;
      void evaluate();
    }, INITIAL_DELAY_MS);

    const ownId = client.userId();
    const subscriptions = [
      client.watchEncryptionStatus(() => {
        if (initialReady) void evaluate();
      }),
      client.watchTrustChanges((userIds) => {
        if (initialReady && ownId && userIds.includes(ownId)) void evaluate();
      }),
    ];

    return () => {
      cancelled = true;
      clearTimeout(initialTimer);
      if (retryTimer) clearTimeout(retryTimer);
      subscriptions.forEach((s) => s.cancel());
    };
  }, [client, syncReady, setState]);
}
