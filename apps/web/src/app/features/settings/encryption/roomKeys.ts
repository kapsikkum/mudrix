/** The passphrase rule the room key export and import share. */
export const MIN_PASSPHRASE_LENGTH = 1;

/** What the export dialog offers as the file name. */
export const ROOM_KEYS_FILE_NAME = 'mudrix-room-keys.txt';

/** Whether the passphrase is long enough; a matching confirmation is checked separately. */
export function isPassphraseLongEnough(passphrase: string): boolean {
  return passphrase.length >= MIN_PASSPHRASE_LENGTH;
}

/** Whether an export may start: the passphrase is long enough and both fields agree. */
export function canExportKeys(passphrase: string, confirmation: string): boolean {
  return isPassphraseLongEnough(passphrase) && passphrase === confirmation;
}

/** The core's error code (`wrongRecoveryKey` for a wrong passphrase), when it sent one. */
export function coreErrorCode(error: unknown): string | null {
  if (!error || typeof error !== 'object') return null;
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' ? code : null;
}

/** The last part of a file path, for showing which file was chosen. Both separators count. */
export function keyFileName(path: string): string {
  return path.split(/[\\/]/).pop() || path;
}
