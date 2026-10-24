import { useEffect } from 'react';
import { useSetAtom } from 'jotai';
import type { MatrixClient } from 'matrix-js-sdk';
import { CryptoEvent } from 'matrix-js-sdk/lib/crypto-api';
import { sessionVerificationAtom } from '@/app/store/atoms';
import { evaluateSessionVerification } from '@/app/features/device/sessionVerification';

const RETRY_DELAY_MS = 5000;

const EVENTS = [
  CryptoEvent.UserTrustStatusChanged,
  CryptoEvent.KeysChanged,
  CryptoEvent.DevicesUpdated,
] as const;

export function useSessionVerification(client: MatrixClient | null, syncReady: boolean) {
  const setState = useSetAtom(sessionVerificationAtom);

  useEffect(() => {
    if (!client || !syncReady) return;

    let cancelled = false;
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

    void evaluate();
    const onChanged = () => void evaluate();
    for (const event of EVENTS) client.on(event as Parameters<typeof client.on>[0], onChanged);

    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
      for (const event of EVENTS) client.off(event as Parameters<typeof client.off>[0], onChanged);
    };
  }, [client, syncReady, setState]);
}
