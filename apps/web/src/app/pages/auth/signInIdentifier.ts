import type { LoginIdentifier } from '@wizardchat/core';

export type SignInIdentifier =
  | { kind: 'user'; user: string }
  | { kind: 'mxid'; user: string }
  | { kind: 'email'; address: string }
  | { kind: 'phone'; number: string };

const EMAIL_RE = /^[^\s@:]+@[^\s@:]+\.[^\s@:]{2,}$/;
const MXID_RE = /^@([^:\s]+):([^\s]+)$/;
const PHONE_CHARS_RE = /^\+?[\d\s().-]{7,24}$/;

/**
 * Only input that clearly looks like a phone number counts as one: a leading `+`, or explicit
 * formatting (spaces, dashes, parentheses) around plenty of digits. A bare run of digits such as
 * `1234567` is a valid username, so it stays one.
 */
function looksLikePhone(value: string): boolean {
  if (!PHONE_CHARS_RE.test(value)) return false;
  const digits = value.replace(/\D/g, '').length;
  if (value.startsWith('+')) return digits >= 7 && digits <= 15;
  return /[\s()-]/.test(value) && digits >= 9 && digits <= 15;
}

/**
 * Reads what someone typed into the sign-in box: a username, a full user id `@name:server`, or an
 * email address or phone number bound to the account.
 */
export function parseIdentifier(raw: string): SignInIdentifier | null {
  const value = raw.trim();
  if (!value) return null;
  if (MXID_RE.test(value)) return { kind: 'mxid', user: value };
  if (EMAIL_RE.test(value)) return { kind: 'email', address: value };
  if (looksLikePhone(value)) return { kind: 'phone', number: value.replace(/\D/g, '') };
  // "@name" without a server: the server wants just the name.
  return { kind: 'user', user: value.replace(/^@/, '') };
}

/**
 * Like parseIdentifier, knowing which server is selected: `ash@example.org` while signing in to
 * example.org is somebody writing their user id email-style (nobody has a mailbox on a Matrix
 * server name), so it means the user `ash`.
 */
export function interpretIdentifier(raw: string, serverName: string): SignInIdentifier | null {
  const id = parseIdentifier(raw);
  if (id?.kind === 'email' && serverName) {
    const at = id.address.lastIndexOf('@');
    if (id.address.slice(at + 1).toLowerCase() === serverName.toLowerCase()) {
      return { kind: 'user', user: id.address.slice(0, at) };
    }
  }
  return id;
}

/** The core's identifier for a password sign-in. */
export function toLoginIdentifier(id: SignInIdentifier): LoginIdentifier {
  switch (id.kind) {
    case 'email':
      return { type: 'email', address: id.address };
    case 'phone':
      return { type: 'phone', number: id.number };
    default:
      return { type: 'user', user: id.user };
  }
}
