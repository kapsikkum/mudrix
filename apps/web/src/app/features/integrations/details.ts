/**
 * Link details (`permissions.linkDetails`): for a matched card, one GET to the single approved
 * host, built only from the approved path template and what the card's `pathPattern` captured
 * from the link. The request is made by `util/integrationFetch.ts` (https, only the hosts the person
 * approved, no cookies, no referrer, redirects checked, a size cap and a timeout, JSON only). Only
 * the named fields of the JSON answer are kept, as plain text. Nothing here renders.
 */
import {
  passiveFetchesBlocked,
  fetchIntegration,
  type FetchResult,
} from '../../../util/integrationFetch';
import { stripUnsafeChars, type LinkFactFormat, type LinkLookup } from './manifest';
import { NO_SETTING_VALUES, lookupShowsAnything, settingOn, type SettingValues } from './settings';

export const MAX_DETAILS_RESPONSE_BYTES = 64 * 1024;
const MAX_TITLE = 120;
const MAX_DESCRIPTION = 300;
const MAX_FACT = 60;

export interface LinkDetailsFact {
  label: string;
  value: string;
}

export interface LinkDetails {
  title?: string;
  description?: string;
  facts: LinkDetailsFact[];
}

export type LookupUrl = { ok: true; url: string } | { ok: false; error: string };

/**
 * The exact URL a lookup requests for these captures, or why there is none. Values are
 * percent-encoded, so they can not add segments, a query or a fragment; a path that would still
 * contain a "." or ".." segment is refused.
 */
export function buildLookupUrl(
  host: string,
  lookup: LinkLookup,
  captures: Record<string, string>
): LookupUrl {
  let missing = false;
  const path = lookup.path.replace(/\{([a-z][a-z0-9_]{0,15})\}/g, (_m, name: string) => {
    if (!Object.prototype.hasOwnProperty.call(captures, name)) {
      missing = true;
      return '';
    }
    return encodeURIComponent(captures[name]);
  });
  if (missing) return { ok: false, error: 'The link does not fill the lookup path' };
  if (path.split('/').some((s) => s === '.' || s === '..'))
    return { ok: false, error: 'Invalid lookup path' };
  const url = `https://${host}${path}`;
  try {
    const u = new URL(url);
    if (u.host !== host || u.pathname !== path || u.search || u.hash)
      return { ok: false, error: 'Invalid lookup path' };
  } catch {
    return { ok: false, error: 'Invalid lookup URL' };
  }
  return { ok: true, url };
}

/** Reads a dotted field from parsed JSON, own properties only. */
function readField(json: unknown, field: string): unknown {
  let cur: unknown = json;
  for (const part of field.split('.')) {
    if (typeof cur !== 'object' || cur === null || Array.isArray(cur)) return undefined;
    if (!Object.prototype.hasOwnProperty.call(cur, part)) return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}

/** Plain, single-line, capped text; '' when nothing is left. */
function cleanText(value: string, max: number): string {
  // Newlines are unsafe characters too, so turn whitespace into spaces before stripping the rest.
  const s = stripUnsafeChars(value.replace(/\s/g, ' ')).replace(/ {2,}/g, ' ').trim();
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

/** Formats a value for display, or '' when it cannot be shown in that format. */
export function formatValue(value: unknown, format: LinkFactFormat, locale?: string): string {
  if (format === 'count') {
    if (typeof value !== 'number' || !Number.isFinite(value)) return '';
    try {
      return new Intl.NumberFormat(locale, {
        notation: 'compact',
        maximumFractionDigits: 1,
      }).format(value);
    } catch {
      return String(value);
    }
  }
  if (format === 'date') {
    if (typeof value !== 'string' || value.length > 40) return '';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '';
    try {
      return d.toLocaleDateString(locale, { year: 'numeric', month: 'short', day: 'numeric' });
    } catch {
      return d.toISOString().slice(0, 10);
    }
  }
  if (typeof value === 'string') return cleanText(value, MAX_FACT);
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return '';
}

/**
 * Picks the approved fields out of an answer. Missing, empty or unusable fields are left out, and
 * so are the ones the person switched off in the integration's settings.
 */
export function extractDetails(
  json: unknown,
  lookup: LinkLookup,
  locale?: string,
  settings: SettingValues = NO_SETTING_VALUES
): LinkDetails {
  const out: LinkDetails = { facts: [] };
  if (lookup.title) {
    const v = readField(json, lookup.title);
    if (typeof v === 'string' && cleanText(v, MAX_TITLE)) out.title = cleanText(v, MAX_TITLE);
  }
  if (lookup.description && settingOn(settings, lookup.descriptionIf)) {
    const v = readField(json, lookup.description);
    if (typeof v === 'string' && cleanText(v, MAX_DESCRIPTION))
      out.description = cleanText(v, MAX_DESCRIPTION);
  }
  (lookup.facts ?? []).forEach((f) => {
    if (!settingOn(settings, f.if)) return;
    const value = formatValue(readField(json, f.field), f.format ?? 'text', locale);
    if (value) out.facts.push({ label: f.label, value });
  });
  return out;
}

export type DetailsResult =
  | { ok: true; details: LinkDetails }
  /** `paused`: nothing was asked because passive requests are off right now (streamer mode). */
  | { ok: false; error: string; paused?: true };

// ---------- request discipline: cache, one request per URL at a time, a budget per host ----------

const CACHE_OK_MS = 15 * 60 * 1000;
const CACHE_FAIL_MS = 5 * 60 * 1000;
/** An answer older than this is never shown, even when the host can not be asked again. */
const MAX_STALE_MS = 24 * 60 * 60 * 1000;
const MAX_CACHE = 200;
/** After a 403 or 429 (rate limited) the host is left alone for a while. */
const BACKOFF_MS = 15 * 60 * 1000;
/** At most this many requests per host in any 10 minutes, whatever is on screen. */
const HOST_BUDGET = 30;
const HOST_WINDOW_MS = 10 * 60 * 1000;

interface CacheEntry {
  /** The last good answer, or null when there is none. */
  json: unknown | null;
  error?: string;
  /** The host's entity tag for `json`, used to ask "has it changed?" once it is stale. */
  etag?: string;
  /** When `json` was received or last confirmed unchanged (a 304). */
  confirmedAt: number;
  /** Nothing is requested for this URL before this time. */
  freshUntil: number;
}
type Outcome = { json: unknown | null; error?: string };

const cache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<Outcome>>();
const backoffUntil = new Map<string, number>();
const recent = new Map<string, number[]>();
/** Hosts whose CORS rules turned a conditional request away: asked plainly from then on. */
const noConditional = new Set<string>();

function remember(url: string, entry: CacheEntry) {
  cache.delete(url);
  if (cache.size >= MAX_CACHE) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(url, entry);
}

/** The cached answer if it is not too old to show, else null. */
function staleJson(entry: CacheEntry | undefined): unknown | null {
  return entry && entry.json !== null && Date.now() - entry.confirmedAt < MAX_STALE_MS
    ? entry.json
    : null;
}

/** Takes one request from the host's budget; returns its timestamp, or null when spent. */
function takeBudget(host: string): number | null {
  const now = Date.now();
  const list = (recent.get(host) ?? []).filter((t) => now - t < HOST_WINDOW_MS);
  if (list.length >= HOST_BUDGET) {
    recent.set(host, list);
    return null;
  }
  list.push(now);
  recent.set(host, list);
  return now;
}

/** Gives a request back (a 304 did not cost the host an answer). */
function refundBudget(host: string, at: number) {
  const list = recent.get(host);
  const i = list ? list.indexOf(at) : -1;
  if (list && i >= 0) list.splice(i, 1);
}

async function request(
  url: string,
  host: string,
  allow: readonly string[],
  etag: string | undefined
): Promise<FetchResult> {
  const conditional = etag !== undefined && !noConditional.has(host) ? etag : undefined;
  const base = {
    url,
    allow,
    expect: 'json',
    maxBytes: MAX_DETAILS_RESPONSE_BYTES,
    passive: true,
  } as const;
  if (!conditional) return fetchIntegration(base);
  const res = await fetchIntegration({ ...base, ifNoneMatch: conditional });
  // If-None-Match needs a CORS preflight, which some hosts refuse: ask plainly from now on.
  if (res.ok || !res.network) return res;
  noConditional.add(host);
  return fetchIntegration(base);
}

async function refresh(
  url: string,
  host: string,
  allow: readonly string[],
  previous: CacheEntry | undefined,
  budgetAt: number
): Promise<Outcome> {
  const stale = staleJson(previous);
  const res = await request(url, host, allow, stale !== null ? previous?.etag : undefined);
  const now = Date.now();
  if (!res.ok && res.status === 304 && stale !== null && previous) {
    refundBudget(host, budgetAt);
    remember(url, {
      ...previous,
      error: undefined,
      confirmedAt: now,
      freshUntil: now + CACHE_OK_MS,
    });
    return { json: stale };
  }
  if (res.ok) {
    const out: Outcome = { json: res.json ?? null };
    remember(url, {
      ...out,
      ...(res.etag ? { etag: res.etag } : {}),
      confirmedAt: now,
      freshUntil: now + CACHE_OK_MS,
    });
    return out;
  }
  if (res.status === 403 || res.status === 429) backoffUntil.set(host, now + BACKOFF_MS);
  // A slow-down, a server error or no answer at all says nothing about the link itself: keep
  // showing what we had. Anything else (404, 410, ...) means the old answer is no longer true.
  const transient =
    res.status === undefined || res.status === 403 || res.status === 429 || res.status >= 500;
  if (transient && stale !== null && previous) {
    remember(url, { ...previous, freshUntil: now + CACHE_FAIL_MS });
    return { json: stale };
  }
  remember(url, {
    json: null,
    error: res.error,
    confirmedAt: now,
    freshUntil: now + CACHE_FAIL_MS,
  });
  return { json: null, error: res.error };
}

/** True when a lookup for this URL is already cached (no request would be made). */
export function isLookupCached(url: string): boolean {
  const hit = cache.get(url);
  return !!hit && Date.now() < hit.freshUntil;
}

/**
 * Looks the link up. `allow` is the list of hosts the person approved for this integration (see
 * hosts.ts). Never throws; failures are only ever "no details".
 */
export async function loadLinkDetails(
  host: string,
  lookup: LinkLookup,
  captures: Record<string, string>,
  allow: readonly string[],
  locale?: string,
  settings: SettingValues = NO_SETTING_VALUES
): Promise<DetailsResult> {
  try {
    // Every field it could show is switched off: nothing to ask for.
    if (!lookupShowsAnything(lookup, settings)) return { ok: true, details: { facts: [] } };
    const built = buildLookupUrl(host, lookup, captures);
    if (!built.ok) return built;
    const { url } = built;
    const finish = (r: Outcome): DetailsResult =>
      r.json === null
        ? { ok: false, error: r.error ?? 'No details' }
        : { ok: true, details: extractDetails(r.json, lookup, locale, settings) };
    const entry = cache.get(url);
    if (entry && Date.now() < entry.freshUntil) return finish(entry);
    const pending = inflight.get(url);
    if (pending) return finish(await pending);
    // When the host can not be asked right now, a recent enough answer is better than none.
    const stale = staleJson(entry);
    // Streamer mode: nothing leaves the device on its own, and nothing is remembered as a failure.
    if (passiveFetchesBlocked())
      return stale !== null
        ? finish({ json: stale })
        : { ok: false, error: 'paused', paused: true };
    if ((backoffUntil.get(host) ?? 0) > Date.now())
      return stale !== null
        ? finish({ json: stale })
        : { ok: false, error: `${host} asked to slow down` };
    const budgetAt = takeBudget(host);
    if (budgetAt === null)
      return stale !== null
        ? finish({ json: stale })
        : { ok: false, error: `Too many lookups on ${host} just now` };
    const p = refresh(url, host, allow, entry, budgetAt);
    inflight.set(url, p);
    try {
      return finish(await p);
    } finally {
      inflight.delete(url);
    }
  } catch {
    return { ok: false, error: 'No details' };
  }
}

/** Test hook: forgets every cached answer, budget and backoff. */
export function resetLinkDetailsState() {
  cache.clear();
  inflight.clear();
  backoffUntil.clear();
  recent.clear();
  noConditional.clear();
}
