/**
 * Helpers for validating and safely navigating to or opening external and internal URLs.
 * Prevents javascript:, data:, and open redirect / XSS vulnerabilities.
 */

const DEFAULT_SAFE_PROTOCOLS = ['https:', 'http:'];

/**
 * Checks whether a given URL string or URL object has a safe HTTP/HTTPS protocol.
 * Rejects javascript:, data:, file:, and other unsafe schemes.
 */
export function isSafeUrl(
  url: string | URL | null | undefined,
  allowedProtocols = DEFAULT_SAFE_PROTOCOLS
): boolean {
  if (!url) return false;
  try {
    const parsed = typeof url === 'string' ? new URL(url) : url;
    return allowedProtocols.includes(parsed.protocol);
  } catch {
    return false;
  }
}

/**
 * Returns a normalized, validated external URL string if it uses an allowed protocol,
 * or null if invalid or unsafe.
 */
export function safeExternalUrl(
  url: string | URL | null | undefined,
  allowedProtocols = DEFAULT_SAFE_PROTOCOLS
): string | null {
  if (!url) return null;
  try {
    const parsed = typeof url === 'string' ? new URL(url) : url;
    if (allowedProtocols.includes(parsed.protocol)) {
      return parsed.href;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Checks whether a URL is on the exact same origin as the application (or a given base origin).
 * Also guards against protocol-relative URLs (`//evil.com`) and invalid URLs.
 */
export function isSameOriginUrl(
  url: string | URL | null | undefined,
  baseOrigin?: string
): boolean {
  if (!url) return false;
  const origin = baseOrigin ?? (typeof window !== 'undefined' ? window.location.origin : '');
  if (!origin) return false;
  try {
    const parsed = typeof url === 'string' ? new URL(url, origin) : url;
    return parsed.origin === origin;
  } catch {
    return false;
  }
}

/**
 * Validates that a URL is same-origin and returns its safe string representation,
 * or null if invalid or cross-origin.
 */
export function safeSameOriginUrl(
  url: string | URL | null | undefined,
  baseOrigin?: string
): string | null {
  if (!url) return null;
  const origin = baseOrigin ?? (typeof window !== 'undefined' ? window.location.origin : '');
  if (!origin) return null;
  try {
    const parsed = typeof url === 'string' ? new URL(url, origin) : url;
    if (parsed.origin === origin) {
      return parsed.href;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Opens an external URL in a new window/tab safely, ensuring an allowed scheme and
 * noopener,noreferrer features.
 */
export function openSafeExternalUrl(
  url: string | null | undefined,
  target = '_blank',
  features = 'noopener,noreferrer'
): Window | null {
  const safe = safeExternalUrl(url);
  if (!safe) {
    console.warn('[safeUrl] Refusing to open unsafe URL:', url);
    return null;
  }
  // Ensure noopener is always included for security
  let safeFeatures = features;
  if (!safeFeatures.includes('noopener')) {
    safeFeatures = safeFeatures ? `${safeFeatures},noopener` : 'noopener';
  }
  if (!safeFeatures.includes('noreferrer')) {
    safeFeatures = safeFeatures ? `${safeFeatures},noreferrer` : 'noreferrer';
  }
  return window.open(safe, target, safeFeatures);
}

/**
 * Checks whether a Matrix media URL is a valid mxc:// URL.
 */
export function isSafeMatrixMediaUrl(url: string | null | undefined): boolean {
  if (!url || typeof url !== 'string') return false;
  return /^mxc:\/\/[a-zA-Z0-9.\-_]+(\/[a-zA-Z0-9.\-_]+)+$/.test(url.trim());
}
