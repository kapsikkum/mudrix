import type { MudrixClient as MatrixClient } from '@mudrix/core';
import type { SessionVerificationState } from '@/app/store/atoms';
import { errorCode } from '@/core/client';
import { startSasVerification } from './startSasVerification';
import { isCurrentDeviceTrusted, sessionVerificationSnapshot } from './sessionVerificationStatus';

export async function evaluateSessionVerification(
  client: MatrixClient
): Promise<SessionVerificationState | null> {
  const userId = client.userId();
  if (!userId) return null;

  const status = await client.encryptionStatus();
  if (status.recovery === 'unknown') return null;

  const { hasIdentity } = await client.userTrust(userId);
  // A fetch failure keeps the warning (the old behaviour) rather than claiming a trust it didn't see.
  const devices = hasIdentity ? await client.devices().catch(() => []) : [];

  return sessionVerificationSnapshot({
    recovery: status.recovery,
    deviceVerified: status.deviceVerified,
    hasIdentity,
    devices,
  });
}

const VERIFIED_SETTLE_TIMEOUT_MS = 10_000;
const VERIFIED_SETTLE_INTERVAL_MS = 500;

/**
 * The core reports `deviceVerified` a moment after a verification finished (the SDK refreshes it on
 * the next device-keys query; the Rust core's security test polls for it too). Wait for that so the
 * "verify this session" warning goes away as soon as the session really is verified.
 */
export async function waitForDeviceVerified(
  client: MatrixClient,
  timeoutMs = VERIFIED_SETTLE_TIMEOUT_MS
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const status = await client.encryptionStatus().catch(() => null);
    if (status?.deviceVerified) return true;
    if (Date.now() >= deadline) {
      const devices = await client.devices().catch(() => []);
      return isCurrentDeviceTrusted(false, devices);
    }
    await new Promise((resolve) => setTimeout(resolve, VERIFIED_SETTLE_INTERVAL_MS));
  }
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

  // Recovering stays local until the SDK refreshes its verification state: wait for it, or the
  // caller reports "backup only" on a session that the key did verify.
  if (await waitForDeviceVerified(client)) return 'verified';
  const status = await client.encryptionStatus().catch(() => null);
  return status?.backupEnabled ? 'backup-only' : 'nothing-stored';
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
