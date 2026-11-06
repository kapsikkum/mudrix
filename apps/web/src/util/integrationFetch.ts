/**
 * The only place integrations and link details reach a third-party host. Nothing else under
 * `features/integrations` calls `fetch` (an ESLint rule keeps it that way), so every rule about
 * outbound requests lives here:
 *
 * - https only, no credentials in the URL, default port only, never an IP address or a local-looking name;
 * - only hosts in the allow-list the caller passes, which comes from what the user approved for that
 *   integration (shown to them when they installed it), or from the repository address they typed;
 * - no cookies, no referrer, no cache, and the only headers are Accept, a JSON Content-Type on a
 *   POST and (for a conditional GET) If-None-Match;
 * - redirects are never followed blindly: each hop is checked against the same allow-list (so is
 *   its scheme), at most three, GET only. A browser hides where a redirect leads (an "opaque"
 *   redirect), and that case is refused;
 * - a size cap enforced while the body streams, and a timeout;
 * - the answer must be what the caller expects: JSON (parsed here), or for the two files a
 *   repository needs, the signed repo.json (which GitHub serves as text/plain) and its short
 *   detached signature. Nothing else is accepted, so nothing from a response is ever markup;
 * - a request that nobody asked for (a link card looking something up while a message is on
 *   screen) is refused while a blocker is set, which the app uses for streamer mode.
 *
 * It never throws and has no imports, so it runs in the unit tests as it is.
 */

/** No answer may be bigger than this, whatever the caller asks for. */
export const MAX_RESPONSE_BYTES = 1024 * 1024;
export const DEFAULT_MAX_BYTES = MAX_RESPONSE_BYTES;
export const DEFAULT_TIMEOUT_MS = 10_000;
export const MAX_TIMEOUT_MS = 30_000;
export const MAX_REDIRECTS = 3;
const MAX_URL_LENGTH = 2000;
const MAX_REQUEST_BODY_BYTES = 64 * 1024;

/** What the answer has to be. */
export type Expect =
  /** `application/json` or `application/*+json`; parsed into `json`. */
  | 'json'
  /** A repo.json: JSON, but `text/plain` is accepted too (GitHub raw serves it that way). */
  | 'jsonFile'
  /** A short `text/plain` file, the detached signature of a repo.json. Returned in `text`. */
  | 'signature';

export interface IntegrationRequest {
  url: string;
  /** Exact lowercase hostnames this request (and every redirect it follows) may reach. */
  allow: readonly string[];
  expect: Expect;
  maxBytes?: number;
  timeoutMs?: number;
  /** A POST (the one thing a user confirmed). Never redirected. */
  post?: boolean;
  /** With `post`: this JSON text as the body. */
  jsonBody?: string;
  /** A conditional GET: sends If-None-Match with this entity tag (only if it is well formed). */
  ifNoneMatch?: string;
  /** Not started by a user action; refused while the blocker (see setPassiveFetchBlocker) is on. */
  passive?: boolean;
  signal?: AbortSignal;
}

export type FetchFailure = {
  ok: false;
  error: string;
  /** Set when the host answered with an HTTP error (or 304 Not Modified for a conditional GET). */
  status?: number;
  /** Set when no answer arrived at all. */
  network?: true;
  /** Why Mudrix itself refused or gave up, as opposed to the host's answer. */
  reason?:
    'blocked' | 'forbidden' | 'redirect' | 'too-large' | 'timeout' | 'type' | 'invalid' | 'network';
};

export type FetchSuccess = {
  ok: true;
  /** The URL that finally answered (after any checked redirect). */
  url: string;
  bytes: Uint8Array;
  contentType: string;
  /** For `json` and `jsonFile`. */
  json?: unknown;
  /** For `signature`. */
  text?: string;
  /** Only set for a well-formed entity tag the host let us read. */
  etag?: string;
};

export type FetchResult = FetchSuccess | FetchFailure;

/** The `error` of a result whose body exceeded the cap. */
export const ERR_TOO_LARGE = 'file is too large';

/** A strong or weak entity tag as RFC 9110 allows it, kept short. */
const ETAG = /^(W\/)?"[\x21\x23-\x7e]{0,190}"$/;

export function validEtag(v: string | null | undefined): string | undefined {
  return typeof v === 'string' && ETAG.test(v) ? v : undefined;
}

let passiveBlocker: (() => boolean) | null = null;

/** While `blocker()` is true, requests marked `passive` are refused (streamer mode). */
export function setPassiveFetchBlocker(blocker: (() => boolean) | null): void {
  passiveBlocker = blocker;
}

export function passiveFetchesBlocked(): boolean {
  try {
    return passiveBlocker?.() === true;
  } catch {
    return true;
  }
}

function isPrivateIpv4(host: string): boolean {
  const m = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(host);
  if (!m) return false;
  const [a, b] = [Number(m[1]), Number(m[2])];
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    a >= 224
  );
}

/** True for hosts that are never contacted: IP literals, single-label and local-looking names. */
export function isForbiddenHost(host: string): boolean {
  if (host === '' || host.startsWith('[') || host.includes(':')) return true;
  // URL turns odd IPv4 spellings into dotted form, so any numeric host is an IP.
  if (/^[0-9.]+$/.test(host) || isPrivateIpv4(host)) return true;
  if (!host.includes('.') || host.endsWith('.')) return true;
  return /\.(local|localhost|internal|lan|home|corp|intranet)$/.test(host);
}

export type UrlCheck = { ok: true; url: URL } | { ok: false; error: string };

/** Whether this address may be requested for an allow-list. Pure. */
export function checkRequestUrl(raw: string, allow: readonly string[]): UrlCheck {
  if (typeof raw !== 'string' || raw.length > MAX_URL_LENGTH)
    return { ok: false, error: 'invalid address' };
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return { ok: false, error: 'invalid address' };
  }
  if (u.protocol !== 'https:') return { ok: false, error: 'only https addresses are allowed' };
  if (u.username || u.password)
    return { ok: false, error: 'addresses with credentials are not allowed' };
  // The default port only: an approved host on another port is a different service.
  if (u.port) return { ok: false, error: 'addresses with a port are not allowed' };
  const host = u.hostname.toLowerCase();
  if (isForbiddenHost(host)) return { ok: false, error: `${host || 'that host'} is not allowed` };
  if (!allow.includes(host)) return { ok: false, error: `${host} is not allowed here` };
  u.hash = '';
  return { ok: true, url: u };
}

const ACCEPT: Record<Expect, string> = {
  json: 'application/json',
  jsonFile: 'application/json, text/plain;q=0.9',
  signature: 'text/plain',
};

function contentTypeAllowed(expect: Expect, type: string): boolean {
  const isJson = type === 'application/json' || /^application\/[a-z0-9.+-]+\+json$/.test(type);
  if (expect === 'json') return isJson;
  if (expect === 'jsonFile') return isJson || type === 'text/plain';
  return type === 'text/plain';
}

const fail = (error: string, reason: NonNullable<FetchFailure['reason']>): FetchFailure => ({
  ok: false,
  error,
  reason,
});

/** Reads the body, giving up as soon as it passes the cap. */
async function readCapped(res: Response, max: number): Promise<Uint8Array | null> {
  if (!res.body) {
    const buf = new Uint8Array(await res.arrayBuffer());
    return buf.length > max ? null : buf;
  }
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > max) {
      void reader.cancel().catch(() => {});
      return null;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  chunks.forEach((c) => {
    bytes.set(c, offset);
    offset += c.length;
  });
  return bytes;
}

type FetchImpl = typeof fetch;

/**
 * Makes one request under every rule above. `impl` is only for tests; the app never passes it.
 * Never throws.
 */
export async function fetchIntegration(
  req: IntegrationRequest,
  impl?: FetchImpl
): Promise<FetchResult> {
  const timeoutMs = Math.min(Math.max(req.timeoutMs ?? DEFAULT_TIMEOUT_MS, 1), MAX_TIMEOUT_MS);
  const maxBytes = Math.min(Math.max(req.maxBytes ?? DEFAULT_MAX_BYTES, 1), MAX_RESPONSE_BYTES);
  const post = req.post === true || typeof req.jsonBody === 'string';
  const hasBody = typeof req.jsonBody === 'string';
  const allow = req.allow.map((h) => h.toLowerCase());
  const first = checkRequestUrl(req.url, allow);
  if (!first.ok) return fail(first.error, 'forbidden');
  if (req.passive && passiveFetchesBlocked())
    return fail('not asking while streamer mode is on', 'blocked');
  if (hasBody && new TextEncoder().encode(req.jsonBody).length > MAX_REQUEST_BODY_BYTES)
    return fail('the request is too large', 'invalid');

  const headers: Record<string, string> = { Accept: ACCEPT[req.expect] };
  if (hasBody) headers['Content-Type'] = 'application/json';
  const ifNoneMatch = post ? undefined : validEtag(req.ifNoneMatch);
  if (ifNoneMatch) headers['If-None-Match'] = ifNoneMatch;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  const onAbort = () => ctrl.abort();
  req.signal?.addEventListener('abort', onAbort);
  if (req.signal?.aborted) ctrl.abort();
  const doFetch: FetchImpl = impl ?? ((input, init) => fetch(input, init));
  let current = first.url;
  const host = () => current.hostname;
  try {
    for (let hop = 0; ; hop += 1) {
      const res = await doFetch(current.href, {
        method: post ? 'POST' : 'GET',
        body: hasBody ? req.jsonBody : undefined,
        credentials: 'omit',
        // Never followed by the browser: where a redirect leads is checked here first.
        redirect: 'manual',
        referrerPolicy: 'no-referrer',
        cache: 'no-store',
        mode: 'cors',
        signal: ctrl.signal,
        headers,
      });
      const redirected = res.type === 'opaqueredirect' || (res.status >= 300 && res.status < 400);
      if (redirected && res.status !== 304) {
        if (post)
          return fail(`${host()} answered with a redirect, which is not followed`, 'redirect');
        const location = res.headers.get('location');
        // A browser does not say where an opaque redirect leads, so there is nothing to check.
        if (!location)
          return fail(`${host()} answered with a redirect, which is not followed`, 'redirect');
        if (hop >= MAX_REDIRECTS) return fail('too many redirects', 'redirect');
        let next: string;
        try {
          next = new URL(location, current).href;
        } catch {
          return fail('invalid redirect', 'redirect');
        }
        const hopCheck = checkRequestUrl(next, allow);
        if (!hopCheck.ok) return fail(`redirect refused: ${hopCheck.error}`, 'redirect');
        void res.body?.cancel().catch(() => {});
        current = hopCheck.url;
        continue;
      }
      if (!res.ok)
        return { ok: false, error: `${host()} answered ${res.status}`, status: res.status };
      const declared = Number(res.headers.get('content-length'));
      if (Number.isFinite(declared) && declared > maxBytes) {
        void res.body?.cancel().catch(() => {});
        return { ok: false, error: ERR_TOO_LARGE, reason: 'too-large' };
      }
      const contentType = (res.headers.get('content-type') ?? '')
        .split(';')[0]
        .trim()
        .toLowerCase();
      if (!contentTypeAllowed(req.expect, contentType)) {
        void res.body?.cancel().catch(() => {});
        return fail(`${host()} did not answer with the expected kind of file`, 'type');
      }
      const bytes = await readCapped(res, maxBytes);
      if (bytes === null) return { ok: false, error: ERR_TOO_LARGE, reason: 'too-large' };
      const etag = validEtag(res.headers.get('etag'));
      const out: FetchSuccess = {
        ok: true,
        url: current.href,
        bytes,
        contentType,
        ...(etag ? { etag } : {}),
      };
      let text: string;
      try {
        text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
      } catch {
        return fail(`${host()} sent text that is not UTF-8`, 'invalid');
      }
      if (req.expect === 'signature') {
        out.text = text;
      } else {
        try {
          out.json = JSON.parse(text);
        } catch {
          return fail(`${host()} sent an answer that is not JSON`, 'invalid');
        }
      }
      return out;
    }
  } catch {
    if (ctrl.signal.aborted && !req.signal?.aborted) return fail('timed out', 'timeout');
    return {
      ok: false,
      error: `could not ${post ? 'reach' : 'load'} ${host() || 'file'}`,
      network: true,
      reason: 'network',
    };
  } finally {
    clearTimeout(timer);
    req.signal?.removeEventListener('abort', onAbort);
  }
}
