import { normalizeUrl } from '@/client/initMatrix';

/** `matrix.org`, `chat.example.org:8448`: an address as people write it, without the scheme. */
export function displayHost(url: string): string {
  try {
    const u = new URL(normalizeUrl(url));
    const path = u.pathname.replace(/\/+$/, '');
    // Keep an explicit http:// visible: it matters, and it is what the person typed.
    return `${u.protocol === 'http:' ? 'http://' : ''}${u.host}${path}`;
  } catch {
    return url.trim();
  }
}

/** The host:port of an address, for comparing it with the server part of a user id. */
export function hostOf(url: string): string {
  try {
    return new URL(normalizeUrl(url)).host.toLowerCase();
  } catch {
    return '';
  }
}

/**
 * Whether a typed address is complete enough to be worth asking about. While someone is still
 * typing `matrix.o` there is no point checking (and showing a red "not found" for) every prefix.
 */
export function isCompleteAddress(input: string): boolean {
  const url = normalizeUrl(input);
  if (!url) return false;
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return false;
  }
  if (host === 'localhost') return true;
  if (host.startsWith('[')) return host.endsWith(']');
  const labels = host.split('.');
  if (labels.every((l) => /^\d+$/.test(l))) {
    return labels.length === 4 && labels.every((l) => Number(l) <= 255);
  }
  if (labels.length < 2 || labels.some((l) => !l)) return false;
  const tld = labels[labels.length - 1];
  return /^[a-z][a-z0-9-]+$/.test(tld) || /^xn--/.test(tld);
}
