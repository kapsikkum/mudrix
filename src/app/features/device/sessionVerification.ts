import type { MatrixClient } from 'matrix-js-sdk';
import { VerificationPhase } from 'matrix-js-sdk/lib/crypto-api';
import type { VerificationRequest } from 'matrix-js-sdk/lib/crypto-api/verification';
import { decodeRecoveryKey } from 'matrix-js-sdk/lib/crypto-api/recovery-key';
import type { SessionVerificationState } from '@/app/store/atoms';
import { makeSecretStorageKeyCallback } from '@/app/features/settings/sessions/useRecoveryKeyActions';
import { startDm } from '@/app/hooks/useDms';
import { startSasVerification } from './startSasVerification';
import { isQrImportPending } from '@/client/qrLoginSecrets';

export async function evaluateSessionVerification(
  client: MatrixClient
): Promise<SessionVerificationState | null> {
  const crypto = client.getCrypto();
  const userId = client.getUserId();
  const deviceId = client.getDeviceId();
  if (!crypto || !userId || !deviceId) return null;
  if (isQrImportPending()) return null;

  const hasIdentity = await crypto.userHasCrossSigningKeys(userId, true);
  if (!hasIdentity) {
    return { status: 'no-identity', hasOtherVerifiedSession: false, hasRecoveryKey: false };
  }

  const [secretStorage, crossSigning] = await Promise.all([
    crypto.getSecretStorageStatus(),
    crypto.getCrossSigningStatus(),
  ]);
  const hasRecoveryKey =
    secretStorage.defaultKeyId !== null && crossSigning.privateKeysInSecretStorage;

  const own = await crypto.getDeviceVerificationStatus(userId, deviceId);
  if (own?.crossSigningVerified) {
    return { status: 'verified', hasOtherVerifiedSession: false, hasRecoveryKey };
  }

  const devices = (await crypto.getUserDeviceInfo([userId])).get(userId);
  let hasOtherVerifiedSession = false;
  for (const otherId of devices?.keys() ?? []) {
    if (otherId === deviceId) continue;
    const status = await crypto.getDeviceVerificationStatus(userId, otherId);
    if (status?.signedByOwner) {
      hasOtherVerifiedSession = true;
      break;
    }
  }
  return { status: 'unverified', hasOtherVerifiedSession, hasRecoveryKey };
}

export type RecoveryKeyResult = 'verified' | 'backup-only' | 'invalid-key' | 'nothing-stored';

export async function applyRecoveryKey(
  client: MatrixClient,
  recoveryKey: string
): Promise<RecoveryKeyResult> {
  const crypto = client.getCrypto();
  if (!crypto) throw new Error('Crypto not available');

  let privateKey: Uint8Array;
  try {
    privateKey = decodeRecoveryKey(recoveryKey);
  } catch {
    return 'invalid-key';
  }

  const keyId = await client.secretStorage.getDefaultKeyId();
  const keyInfo = keyId ? (await client.secretStorage.getKey(keyId))?.[1] : undefined;
  if (!keyInfo) return 'nothing-stored';
  if (!(await client.secretStorage.checkKey(privateKey, keyInfo))) return 'invalid-key';

  client.cryptoCallbacks.getSecretStorageKey = makeSecretStorageKeyCallback(client, privateKey);
  client.cryptoCallbacks.cacheSecretStorageKey = () => {};

  const { privateKeysInSecretStorage } = await crypto.getCrossSigningStatus();
  if (privateKeysInSecretStorage) {
    await crypto.bootstrapCrossSigning({});
  }

  let backupEnabled = false;
  try {
    if ((await crypto.getKeyBackupInfo())?.version) {
      await crypto.loadSessionBackupPrivateKeyFromSecretStorage();
      await crypto.checkKeyBackupAndEnable();
      void crypto.restoreKeyBackup().catch(() => {});
      backupEnabled = true;
    }
  } catch {
    // The backup key isn't stored with this recovery key
  }

  if (privateKeysInSecretStorage) return 'verified';
  return backupEnabled ? 'backup-only' : 'nothing-stored';
}

function tearDownWhenFinished(request: VerificationRequest, teardown: () => void): void {
  const onChange = () => {
    if (request.phase === VerificationPhase.Done || request.phase === VerificationPhase.Cancelled) {
      request.off('change' as Parameters<typeof request.off>[0], onChange);
      teardown();
    }
  };
  request.on('change' as Parameters<typeof request.on>[0], onChange);
}

export async function startUserVerification(
  client: MatrixClient,
  userId: string,
  setEmojiModal: Parameters<typeof startSasVerification>[1]
): Promise<void> {
  const crypto = client.getCrypto();
  if (!crypto) throw new Error('Crypto not available');
  const roomId = await startDm(client, userId);
  const request = await crypto.requestVerificationDM(userId, roomId);
  tearDownWhenFinished(request, startSasVerification(request, setEmojiModal));
}

export async function startSelfVerification(
  client: MatrixClient,
  setEmojiModal: Parameters<typeof startSasVerification>[1]
): Promise<void> {
  const crypto = client.getCrypto();
  if (!crypto) throw new Error('Crypto not available');
  const request = await crypto.requestOwnUserVerification();
  tearDownWhenFinished(request, startSasVerification(request, setEmojiModal));
}
