import type { ShieldCode, ShieldView } from '@wizardchat/core';

export type ShieldKind = 'grey' | 'warning' | 'red';

export interface ShieldDisplay {
  kind: ShieldKind;
  reasonKey: string;
}

const REASON_KEYS: Record<ShieldCode, string> = {
  authenticityNotGuaranteed: 'encryption.shield.authenticity',
  unknownDevice: 'encryption.shield.unknownDevice',
  unsignedDevice: 'encryption.shield.unsignedDevice',
  unverifiedIdentity: 'encryption.shield.unverifiedIdentity',
  verificationViolation: 'encryption.shield.violation',
  mismatchedSender: 'encryption.shield.mismatchedSender',
  sentInClear: 'encryption.shield.sentInClear',
};

/**
 * How a message's shield looks: grey for what can't be guaranteed, a warning for a red SDK
 * shield (unverified sender), and the strongest red for a message sent unencrypted into an
 * encrypted room. Null when the message has no shield.
 */
export function shieldDisplay(shield: ShieldView | null | undefined): ShieldDisplay | null {
  if (!shield) return null;
  const reasonKey = REASON_KEYS[shield.code] ?? 'encryption.shield.unknown';
  if (shield.code === 'sentInClear') return { kind: 'red', reasonKey };
  return { kind: shield.color === 'red' ? 'warning' : 'grey', reasonKey };
}
