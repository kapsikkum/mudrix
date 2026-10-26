const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
const LENGTH = 32;
const UNBIASED_LIMIT = 256 - (256 % CHARS.length);

export function generateClientSecret(): string {
  let result = '';
  while (result.length < LENGTH) {
    for (const byte of crypto.getRandomValues(new Uint8Array(LENGTH * 2))) {
      if (byte >= UNBIASED_LIMIT) continue;
      result += CHARS[byte % CHARS.length];
      if (result.length === LENGTH) break;
    }
  }
  return result;
}
