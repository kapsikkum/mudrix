import type { MatrixClient } from 'matrix-js-sdk';
import {
  AllDevicesIsolationMode,
  OnlySignedDevicesIsolationMode,
} from 'matrix-js-sdk/lib/crypto-api';
import { STORAGE_KEY_PREFERENCES } from '@/const/storageKeys';

export function applyDeviceIsolation(client: MatrixClient, excludeInsecure: boolean): void {
  client
    .getCrypto()
    ?.setDeviceIsolationMode(
      excludeInsecure ? new OnlySignedDevicesIsolationMode() : new AllDevicesIsolationMode(false)
    );
}

export function storedExcludeInsecure(): boolean {
  try {
    const prefs = JSON.parse(localStorage.getItem(STORAGE_KEY_PREFERENCES) ?? '{}');
    return prefs?.excludeInsecureSessions === true;
  } catch {
    return false;
  }
}
