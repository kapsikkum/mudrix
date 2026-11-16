import assert from 'node:assert/strict';
import { test } from 'node:test';
import { sessionVerificationSnapshot } from '../src/app/features/device/sessionVerificationStatus.ts';

type Device = {
  deviceId: string;
  displayName: string | null;
  lastSeenIp: string | null;
  lastSeenTs: number | null;
  isCurrent: boolean;
  isVerified: boolean;
  crossSignedByOwner: boolean;
};

const device = (overrides: Partial<Device>): Device => ({
  deviceId: 'CURRENT',
  displayName: null,
  lastSeenIp: null,
  lastSeenTs: null,
  isCurrent: true,
  isVerified: false,
  crossSignedByOwner: false,
  ...overrides,
});

const inputs = (overrides: Partial<Parameters<typeof sessionVerificationSnapshot>[0]>) => ({
  recovery: 'enabled',
  deviceVerified: false,
  hasIdentity: true,
  devices: [device({})],
  ...overrides,
});

test('secret storage not checked yet: no verdict', () => {
  assert.equal(sessionVerificationSnapshot(inputs({ recovery: 'unknown' })), null);
});

test('no cross-signing identity: set up encryption', () => {
  assert.deepEqual(sessionVerificationSnapshot(inputs({ hasIdentity: false })), {
    status: 'no-identity',
    hasOtherVerifiedSession: false,
    hasRecoveryKey: false,
  });
});

test('a cross-signed session counts as verified even while deviceVerified lags', () => {
  assert.deepEqual(
    sessionVerificationSnapshot(
      inputs({
        deviceVerified: false,
        devices: [device({ crossSignedByOwner: true, isVerified: false })],
      })
    ),
    { status: 'verified', hasOtherVerifiedSession: false, hasRecoveryKey: true }
  );
  assert.deepEqual(
    sessionVerificationSnapshot(inputs({ deviceVerified: true, devices: [device({})] })),
    { status: 'verified', hasOtherVerifiedSession: false, hasRecoveryKey: true }
  );
});

test('an untrusted session warns and names what can verify it', () => {
  assert.deepEqual(
    sessionVerificationSnapshot(
      inputs({
        devices: [
          device({}),
          device({ deviceId: 'CROSS', isCurrent: false, crossSignedByOwner: true }),
        ],
      })
    ),
    { status: 'unverified', hasOtherVerifiedSession: true, hasRecoveryKey: true }
  );
  assert.deepEqual(
    sessionVerificationSnapshot(
      inputs({
        recovery: 'disabled',
        devices: [device({}), device({ deviceId: 'TRUSTED', isCurrent: false, isVerified: true })],
      })
    ),
    { status: 'unverified', hasOtherVerifiedSession: true, hasRecoveryKey: false }
  );
});

test('nothing to verify with still warns, without actions', () => {
  assert.deepEqual(sessionVerificationSnapshot(inputs({ recovery: 'disabled' })), {
    status: 'unverified',
    hasOtherVerifiedSession: false,
    hasRecoveryKey: false,
  });
});
