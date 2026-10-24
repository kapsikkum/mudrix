import { useEffect, useState } from 'react';
import type { MatrixClient } from 'matrix-js-sdk';
import { CryptoEvent, type UserVerificationStatus } from 'matrix-js-sdk/lib/crypto-api';

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

  useEffect(() => {
    const crypto = client?.getCrypto();
    if (!client || !crypto || !userId || userId === client.getUserId()) {
      setInfo(UNKNOWN);
      return;
    }
    let cancelled = false;
    const load = async () => {
      try {
        const [status, hasKeys] = await Promise.all([
          crypto.getUserVerificationStatus(userId),
          crypto.userHasCrossSigningKeys(userId, true),
        ]);
        if (!cancelled) setInfo({ verified: status.isCrossSigningVerified(), canVerify: hasKeys });
      } catch {
        if (!cancelled) setInfo(UNKNOWN);
      }
    };
    void load();

    const onTrust = (changedId: string, status: UserVerificationStatus) => {
      if (changedId !== userId) return;
      setInfo((prev) => ({ ...prev, verified: status.isCrossSigningVerified() }));
    };
    client.on(CryptoEvent.UserTrustStatusChanged as Parameters<typeof client.on>[0], onTrust);
    return () => {
      cancelled = true;
      client.off(CryptoEvent.UserTrustStatusChanged as Parameters<typeof client.off>[0], onTrust);
    };
  }, [client, userId]);

  return info;
}
