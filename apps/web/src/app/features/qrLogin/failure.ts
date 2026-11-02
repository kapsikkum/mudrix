export type QrFailureReason =
  | 'cancelled'
  | 'expired'
  | 'insecure'
  | 'unsupported'
  | 'alreadySignedIn'
  | 'checkCode'
  | 'unknown';

export function failureKey(reason: QrFailureReason | undefined): string {
  switch (reason) {
    case 'cancelled':
      return 'qrLogin.failCancelled';
    case 'expired':
      return 'qrLogin.failExpired';
    case 'insecure':
      return 'qrLogin.failInsecure';
    case 'unsupported':
      return 'qrLogin.failUnsupported';
    case 'alreadySignedIn':
      return 'qrLogin.failAlreadySignedIn';
    case 'checkCode':
      return 'qrLogin.codeMismatch';
    default:
      return 'qrLogin.failGeneric';
  }
}

export function reasonOf(err: unknown): QrFailureReason | undefined {
  const message = (err instanceof Error ? err.message : String(err ?? '')).toLowerCase();
  if (!message) return undefined;
  if (/check.?code/.test(message)) return 'checkCode';
  if (/cancel|declin|denied/.test(message)) return 'cancelled';
  if (/expire|timeout|timed out/.test(message)) return 'expired';
  if (/insecure|secure channel/.test(message)) return 'insecure';
  if (/unsupported|not supported|rendezvous|oauth|404/.test(message)) return 'unsupported';
  if (/already/.test(message)) return 'alreadySignedIn';
  return 'unknown';
}

export function decodeQrData(base64: string): Uint8Array {
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
}
