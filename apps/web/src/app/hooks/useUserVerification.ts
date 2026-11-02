import { useEffect, useState } from 'react';
import { useAtomValue } from 'jotai';
import type { WizardClient as MatrixClient } from '@wizardchat/core';
import { emojiVerificationAtom } from '@/app/store/atoms';

export interface UserVerificationInfo {
  verified: boolean;
  canVerify: boolean;
}

const UNKNOWN: UserVerificationInfo = { verified: false, canVerify: false };

export function useUserVerification(
  client: MatrixClient | null,
  userId: string | null | undefined
): UserVerificationInfo {
  const [info, setInfo] = useState<UserVerificationInfo>(UNKNOWN);
  const verificationPhase = useAtomValue(emojiVerificationAtom).phase;

  useEffect(() => {
    if (!client || !userId || userId === client.userId()) {
      setInfo(UNKNOWN);
      return;
    }
    let cancelled = false;
    const load = async () => {
      try {
        const trust = await client.userTrust(userId);
        if (!cancelled) setInfo({ verified: trust.verified, canVerify: trust.hasIdentity });
      } catch {
        if (!cancelled) setInfo(UNKNOWN);
      }
    };
    void load();
    const subscription = client.watchTrustChanges((userIds) => {
      if (userIds.includes(userId)) void load();
    });
    return () => {
      cancelled = true;
      subscription.cancel();
    };
  }, [client, userId, verificationPhase]);

  return info;
}
