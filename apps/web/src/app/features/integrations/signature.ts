/**
 * Repository signatures. repo.json is signed (Ed25519, detached, over its exact bytes) with the
 * key it carries in its own `key` field. That key is then pinned per repository by the user
 * (trust on first use), except the official repository's key, which is built into the app.
 * Nothing here ever falls back to accepting: any failure is a rejection. Nothing throws.
 */
import { OFFICIAL_REPO_KEYS } from './officialKeys';

export type SigResult = { ok: true } | { ok: false; error: string };

export const KEY_BYTES = 32;
export const SIGNATURE_BYTES = 64;
export const MAX_SERIAL = 2147483647;

const B64 = /^[A-Za-z0-9+/]*={0,2}$/;

/** Strict standard base64 (padding required). Null when malformed. */
export function base64ToBytes(text: string): Uint8Array | null {
  if (typeof text !== 'string' || text.length % 4 !== 0 || !B64.test(text)) return null;
  try {
    const bin = atob(text);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

/** True when the text is base64 of exactly 32 bytes. */
export function isValidKey(keyB64: string): boolean {
  return (
    typeof keyB64 === 'string' &&
    keyB64.length === 44 &&
    base64ToBytes(keyB64)?.length === KEY_BYTES
  );
}

/** SHA-256 of the raw key, first 16 bytes as 8 groups of 4 lowercase hex digits. '' if unusable. */
export async function fingerprintKey(keyB64: string): Promise<string> {
  try {
    const raw = base64ToBytes(keyB64);
    if (!raw || raw.length !== KEY_BYTES) return '';
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', raw as BufferSource));
    const hex = Array.from(digest.slice(0, 16), (b) => b.toString(16).padStart(2, '0')).join('');
    return hex.match(/.{4}/g)?.join(' ') ?? '';
  } catch {
    return '';
  }
}

const UNSUPPORTED =
  'This device cannot check signatures (Ed25519 is not supported by this browser), so the repository cannot be trusted.';

export async function verifyRepoSignature(
  bytes: Uint8Array,
  sigText: string,
  keyB64: string
): Promise<SigResult> {
  try {
    const keyBytes = base64ToBytes(keyB64);
    if (!keyBytes || keyBytes.length !== KEY_BYTES || keyB64.length !== 44)
      return { ok: false, error: 'The repository carries a malformed signing key.' };
    const sig = base64ToBytes((sigText ?? '').trim());
    if (!sig || sig.length !== SIGNATURE_BYTES)
      return { ok: false, error: 'The signature file is malformed.' };
    let key: CryptoKey;
    try {
      key = await crypto.subtle.importKey(
        'raw',
        keyBytes as BufferSource,
        { name: 'Ed25519' },
        false,
        ['verify']
      );
    } catch {
      return { ok: false, error: UNSUPPORTED };
    }
    let valid: boolean;
    try {
      valid = await crypto.subtle.verify(
        'Ed25519',
        key,
        sig as BufferSource,
        bytes as BufferSource
      );
    } catch {
      return { ok: false, error: UNSUPPORTED };
    }
    return valid
      ? { ok: true }
      : {
          ok: false,
          error: 'The signature does not match this repository. It may have been tampered with.',
        };
  } catch {
    return { ok: false, error: UNSUPPORTED };
  }
}

/** A serial lower than the one already seen is refused (rollback protection). */
export function checkSerial(prevSerial: number | undefined, nextSerial: number): SigResult {
  if (prevSerial !== undefined && nextSerial < prevSerial)
    return { ok: false, error: 'This repository is older than the version already seen.' };
  return { ok: true };
}

export const KEY_CHANGED_ERROR =
  'This repository now uses a different signing key. Remove it and add it again only if you expected that.';

export type RepoUpdateCheck = { ok: true } | { ok: false; error: string; keyChanged?: boolean };

/** Decides whether a freshly fetched, verified repository may replace the pinned one. */
export function checkRepoUpdate(
  prev: { key: string; serial: number },
  next: { key: string; serial: number }
): RepoUpdateCheck {
  if (prev.key !== next.key) return { ok: false, error: KEY_CHANGED_ERROR, keyChanged: true };
  return checkSerial(prev.serial, next.serial);
}

export function isOfficialKey(keyB64: string): boolean {
  return OFFICIAL_REPO_KEYS.includes(keyB64);
}
