/**
 * What a `/welcome/<address>` link points at, as the address box would hold it.
 *
 * A link may name its scheme (`http://host:6167`, or `http%3A%2F%2Fhost%3A6167` for a client that
 * mangles the slashes). A bare address on this machine or the local network (localhost, `127.x`,
 * `10.x`, `172.16-31.x`, `192.168.x`, `*.local`) is where a test server listens on plain HTTP, so
 * it gets `http://`; anything else keeps the https the address box tries first.
 */

/** `http://`, `https://`, `matrix://`: a scheme the link chose for itself. */
const HAS_SCHEME = /^[a-z][a-z0-9+.-]*:\/\//i;
const PERCENT_ESCAPE = /%[0-9a-f]{2}/i;

/** A host on this machine or the local network. */
export function isLocalHost(hostname: string): boolean {
  const host = hostname
    .trim()
    .toLowerCase()
    .replace(/^\[|\]$/g, '');
  if (host === '::1' || host === 'localhost' || host.endsWith('.localhost')) return true;
  if (host.endsWith('.local')) return true;
  const parts = host.split('.');
  if (parts.length !== 4) return false;
  if (!parts.every((p) => /^\d{1,3}$/.test(p) && Number(p) <= 255)) return false;
  const first = Number(parts[0]);
  const second = Number(parts[1]);
  return (
    first === 127 ||
    first === 10 ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168)
  );
}

/** React Router leaves some links encoded (`host%3A6167`); decode once, and only when it is safe. */
function decode(link: string): string {
  if (!PERCENT_ESCAPE.test(link)) return link;
  try {
    return decodeURIComponent(link);
  } catch {
    return link;
  }
}

/** The address in a welcome link, with the scheme it names or the one a local address implies. */
export function addressFromLink(link: string | null | undefined): string {
  const trimmed = decode((link ?? '').trim()).trim();
  if (!trimmed) return '';
  // The link knows best: it is what the person typed, and `http://` matters.
  if (HAS_SCHEME.test(trimmed)) return trimmed;
  const address = trimmed.replace(/\/+$/, '');
  let host: string;
  try {
    host = new URL(`https://${address}`).hostname;
  } catch {
    return address;
  }
  return isLocalHost(host) ? `http://${address}` : address;
}
