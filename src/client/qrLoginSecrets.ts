import type { CryptoApi } from 'matrix-js-sdk/lib/crypto-api';

type SecretsBundle = Parameters<NonNullable<CryptoApi['importSecretsBundle']>>[0];

let pending: { userId: string; secrets: SecretsBundle } | null = null;
let importing = false;

export function isQrImportPending(): boolean {
  return pending !== null || importing;
}

export function setPendingQrSecrets(userId: string, secrets: SecretsBundle): void {
  pending = { userId, secrets };
}

export async function applyPendingQrSecrets(
  crypto: CryptoApi,
  userId: string,
  deviceId: string
): Promise<void> {
  if (!pending || pending.userId !== userId) return;
  const { secrets } = pending;
  pending = null;
  importing = true;
  try {
    await crypto.importSecretsBundle?.(secrets);
    await crypto.crossSignDevice(deviceId);
    await crypto.checkKeyBackupAndEnable();
  } catch (err) {
    console.error('[qrLogin] importing the shared secrets failed', err);
  } finally {
    importing = false;
  }
}
