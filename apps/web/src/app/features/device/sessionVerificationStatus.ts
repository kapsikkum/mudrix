import type { DeviceInfo } from '@mudrix/core';

/** The encryption facts the session badge is decided from, as the core reports them */
export interface SessionVerificationInputs {
  /** `unknown` until secret storage has been checked; `enabled` or `incomplete` mean a recovery key */
  recovery: string;
  /** The SDK's own verification state for this device */
  deviceVerified: boolean;
  hasIdentity: boolean;
  devices: DeviceInfo[];
}

export interface SessionVerificationSnapshot {
  status: 'verified' | 'unverified' | 'no-identity';
  hasOtherVerifiedSession: boolean;
  hasRecoveryKey: boolean;
}

/**
 * Whether this device is trusted by the account: either the SDK's verification state says so, or -
 * as the old app read it (`DeviceVerificationStatus.isVerified`) - the account's cross-signing
 * identity has signed it. The two disagree right after verifying: `deviceVerified` is only
 * refreshed by the next device-keys query, which is what kept "verify this session" up on a session
 * that already was verified.
 */
export function isCurrentDeviceTrusted(deviceVerified: boolean, devices: DeviceInfo[]): boolean {
  return deviceVerified || devices.some((d) => d.isCurrent && d.crossSignedByOwner);
}

export function sessionVerificationSnapshot(
  inputs: SessionVerificationInputs
): SessionVerificationSnapshot | null {
  const { recovery, deviceVerified, hasIdentity, devices } = inputs;
  // Secret storage hasn't been looked at yet: don't guess a state
  if (recovery === 'unknown') return null;

  if (!hasIdentity) {
    return { status: 'no-identity', hasOtherVerifiedSession: false, hasRecoveryKey: false };
  }

  const hasRecoveryKey = recovery === 'enabled' || recovery === 'incomplete';

  if (isCurrentDeviceTrusted(deviceVerified, devices)) {
    return { status: 'verified', hasOtherVerifiedSession: false, hasRecoveryKey };
  }

  // Another session can verify this one if the account trusts it, either by cross-signing or by a
  // local trust set on this device.
  const hasOtherVerifiedSession = devices.some(
    (d) => !d.isCurrent && (d.crossSignedByOwner || d.isVerified)
  );
  return { status: 'unverified', hasOtherVerifiedSession, hasRecoveryKey };
}
