import type { WizardClient as MatrixClient } from '@wizardchat/core';
import type { SessionVerificationState } from '@/app/store/atoms';
import { errorCode } from '@/core/client';
import { startSasVerification } from './startSasVerification';

export async function evaluateSessionVerification(
  client: MatrixClient
): Promise<SessionVerificationState | null> {
  const userId = client.userId();
  if (!userId) return null;

  const status = await client.encryptionStatus();
  if (status.recovery === 'unknown') return null;

  const { hasIdentity } = await client.userTrust(userId);
  if (!hasIdentity) {
    return { status: 'no-identity', hasOtherVerifiedSession: false, hasRecoveryKey: false };
  }

  const hasRecoveryKey = status.recovery === 'enabled' || status.recovery === 'incomplete';

  if (status.deviceVerified) {
    return { status: 'verified', hasOtherVerifiedSession: false, hasRecoveryKey };
  }

  const devices = await client.devices();
  const hasOtherVerifiedSession = devices.some((d) => !d.isCurrent && d.crossSignedByOwner);
  return { status: 'unverified', hasOtherVerifiedSession, hasRecoveryKey };
}

export type RecoveryKeyResult = 'verified' | 'backup-only' | 'invalid-key' | 'nothing-stored';

export async function applyRecoveryKey(
  client: MatrixClient,
  recoveryKey: string
): Promise<RecoveryKeyResult> {
  try {
    await client.recover(recoveryKey);
  } catch (err) {
    if (errorCode(err) === 'wrongRecoveryKey') return 'invalid-key';
    const status = await client.encryptionStatus().catch(() => null);
    if (status?.recovery === 'disabled') return 'nothing-stored';
    throw err;
  }

  const status = await client.encryptionStatus();
  if (status.deviceVerified) return 'verified';
  return status.backupEnabled ? 'backup-only' : 'nothing-stored';
}

export async function startUserVerification(
  client: MatrixClient,
  userId: string,
  setEmojiModal: Parameters<typeof startSasVerification>[1]
): Promise<void> {
  const request = await client.requestUserVerification(userId);
  startSasVerification(request, setEmojiModal);
}

export async function startSelfVerification(
  client: MatrixClient,
  setEmojiModal: Parameters<typeof startSasVerification>[1]
): Promise<void> {
  const request = await client.requestSelfVerification();
  startSasVerification(request, setEmojiModal);
}
