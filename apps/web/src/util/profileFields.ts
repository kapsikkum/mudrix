/**
 * Extended profile fields (MSC4133). Pure helpers: key names, parsing of what other
 * clients write, and sanitising of untrusted text. No network or React here.
 *
 * Key names are the ones the ecosystem already uses (Lightning, Commet, Sable, Haven):
 *   - bio:       m.biography (MSC4440) + gay.fomx.biography (its unstable prefix)
 *   - banner:    m.banner_url (MSC4427) + chat.commet.profile_banner (unstable prefix)
 *   - pronouns:  m.pronouns (MSC4247) + io.fsky.nyx.pronouns (unstable prefix)
 *   - timezone:  m.tz (stable in MSC4175)
 * Mudrix-only fields (status, accent, decoration, effect, is_user) live in profileCosmetics.ts.
 */

import { EMPTY_COSMETICS, parseCosmetics, type MudrixCosmetics } from './profileCosmetics';

export const PROFILE_BIO_KEY = 'm.biography';
export const PROFILE_BIO_UNSTABLE_KEY = 'gay.fomx.biography';
export const PROFILE_BANNER_KEY = 'm.banner_url';
export const PROFILE_BANNER_UNSTABLE_KEY = 'chat.commet.profile_banner';
export const PROFILE_PRONOUNS_KEY = 'm.pronouns';
export const PROFILE_PRONOUNS_UNSTABLE_KEY = 'io.fsky.nyx.pronouns';
export const PROFILE_TZ_KEY = 'm.tz';

export const BIO_KEYS = [PROFILE_BIO_KEY, PROFILE_BIO_UNSTABLE_KEY] as const;
export const BANNER_KEYS = [PROFILE_BANNER_KEY, PROFILE_BANNER_UNSTABLE_KEY] as const;
export const PRONOUN_KEYS = [PROFILE_PRONOUNS_KEY, PROFILE_PRONOUNS_UNSTABLE_KEY] as const;

/** Ceilings applied on read and write; the protocol specifies none. */
export const MAX_BIO_CHARS = 2048;
export const MAX_BIO_LINES = 40;
export const MAX_PRONOUN_ENTRIES = 5;
export const MAX_PRONOUN_CHARS = 32;

export interface ExtendedProfileFields extends MudrixCosmetics {
  bio: string;
  pronouns: string[];
  timezone: string | null;
  bannerMxc: string | null;
}

export const EMPTY_PROFILE_FIELDS: ExtendedProfileFields = {
  bio: '',
  pronouns: [],
  timezone: null,
  bannerMxc: null,
  ...EMPTY_COSMETICS,
};

// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u0009\u000B-\u001F\u007F-\u009F‪-‮⁦-⁩]/g;

/**
 * Normalise and bound untrusted bio text: CRLF -> LF, control and bidi-override characters
 * become spaces, runs of blank lines collapse, the block is trimmed and capped.
 */
export function sanitizeBio(text: string): string {
  const normalized = text.replace(/\r\n?/g, '\n').replace(CONTROL_CHARS, ' ');
  const lines: string[] = [];
  let blankRun = 0;
  for (const raw of normalized.split('\n')) {
    const line = raw.replace(/\s+$/, '');
    if (line === '') {
      blankRun += 1;
      if (blankRun > 1) continue;
    } else {
      blankRun = 0;
    }
    lines.push(line);
    if (lines.length >= MAX_BIO_LINES) break;
  }
  while (lines.length && lines[0] === '') lines.shift();
  while (lines.length && lines[lines.length - 1] === '') lines.pop();
  return Array.from(lines.join('\n')).slice(0, MAX_BIO_CHARS).join('');
}

/** Conservative tag stripper for peers that only wrote an HTML bio. Output is shown as text. */
function stripHtml(html: string): string {
  return html
    .replace(/<\s*(br|\/p|\/div|\/li)\b[^>]*>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Plain text from an MSC4440 value (`{ "m.text": [{ body, mimetype? }] }`) or a bare string. */
export function parseBioValue(value: unknown): string {
  if (typeof value === 'string') return sanitizeBio(value);
  if (!isRecord(value)) return '';
  const entries = value['m.text'];
  if (!Array.isArray(entries)) return '';
  let htmlFallback = '';
  for (const entry of entries) {
    if (typeof entry === 'string') {
      const cleaned = sanitizeBio(entry);
      if (cleaned) return cleaned;
      continue;
    }
    if (!isRecord(entry) || typeof entry.body !== 'string') continue;
    const mime = typeof entry.mimetype === 'string' ? entry.mimetype.toLowerCase() : '';
    if (mime === 'text/html') {
      if (!htmlFallback) htmlFallback = sanitizeBio(stripHtml(entry.body));
      continue;
    }
    const cleaned = sanitizeBio(entry.body);
    if (cleaned) return cleaned;
  }
  return htmlFallback;
}

/** The MSC4440 value we write: one plain `m.text` entry, never HTML. */
export function bioToValue(text: string): { 'm.text': { body: string }[] } {
  return { 'm.text': [{ body: text }] };
}

export function sanitizePronoun(text: string): string {
  return Array.from(text.replace(CONTROL_CHARS, ' ').replace(/\s+/g, ' ').trim())
    .slice(0, MAX_PRONOUN_CHARS)
    .join('');
}

/** Pronoun summaries from `[{ summary, language? }]`. Tolerates plain string entries. */
export function parsePronounsValue(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const entry of value) {
    const raw = typeof entry === 'string' ? entry : isRecord(entry) ? entry.summary : undefined;
    if (typeof raw !== 'string') continue;
    const cleaned = sanitizePronoun(raw);
    if (cleaned && !out.includes(cleaned)) out.push(cleaned);
    if (out.length >= MAX_PRONOUN_ENTRIES) break;
  }
  return out;
}

export function pronounsToValue(pronouns: string[]): { language: string; summary: string }[] {
  return pronouns.map((summary) => ({ language: 'en', summary }));
}

/** "she/her, they/them" -> ['she/her', 'they/them'] */
export function parsePronounsInput(input: string): string[] {
  return parsePronounsValue(input.split(/[,;\n]/));
}

export function formatPronouns(pronouns: string[]): string {
  return pronouns.join(', ');
}

export function isValidTimeZone(tz: unknown): tz is string {
  if (typeof tz !== 'string' || !tz || tz.length > 64) return false;
  try {
    new Intl.DateTimeFormat('en', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

function isMxc(v: unknown): v is string {
  return typeof v === 'string' && /^mxc:\/\/[^/\s]+\/[^/\s]+$/.test(v);
}

/** Turn a raw profile object into the fields we display. Unknown or malformed keys are ignored. */
export function parseExtendedProfile(raw: Record<string, unknown> | null | undefined) {
  if (!raw) return { ...EMPTY_PROFILE_FIELDS };
  let bio = '';
  for (const key of BIO_KEYS) {
    bio = parseBioValue(raw[key]);
    if (bio) break;
  }
  let pronouns: string[] = [];
  for (const key of PRONOUN_KEYS) {
    pronouns = parsePronounsValue(raw[key]);
    if (pronouns.length) break;
  }
  // Unstable banner key wins when they disagree (it is the one Commet, Sable and Haven read).
  const bannerMxc = [raw[PROFILE_BANNER_UNSTABLE_KEY], raw[PROFILE_BANNER_KEY]].find(isMxc) ?? null;
  const tz = raw[PROFILE_TZ_KEY];
  return {
    bio,
    pronouns,
    timezone: isValidTimeZone(tz) ? tz : null,
    bannerMxc,
    ...parseCosmetics(raw),
  } satisfies ExtendedProfileFields;
}

export type TextPart =
  { type: 'text'; text: string } | { type: 'link'; text: string; href: string };

const URL_RE = /https?:\/\/[^\s<>"'`]+/gi;
const TRAILING_PUNCT = /[.,;:!?)\]}'"]$/;

/** Split plain text into text and http(s) link parts. Never produces HTML. */
export function linkifyParts(text: string): TextPart[] {
  const parts: TextPart[] = [];
  let last = 0;
  for (const m of text.matchAll(URL_RE)) {
    const start = m.index ?? 0;
    let url = m[0];
    // Drop trailing punctuation, but keep a ')' that closes a '(' inside the URL.
    const count = (str: string, ch: string) => str.split(ch).length - 1;
    while (TRAILING_PUNCT.test(url)) {
      if (url.endsWith(')') && count(url, '(') >= count(url, ')')) break;
      url = url.slice(0, -1);
    }
    let href: string | null = null;
    try {
      const u = new URL(url);
      if (u.protocol === 'http:' || u.protocol === 'https:') href = u.href;
    } catch {
      href = null;
    }
    if (!href) continue;
    if (start > last) parts.push({ type: 'text', text: text.slice(last, start) });
    parts.push({ type: 'link', text: url, href });
    last = start + url.length;
  }
  if (last < text.length) parts.push({ type: 'text', text: text.slice(last) });
  return parts;
}

/** Local time in `tz` as e.g. "14:32", plus the offset relative to the viewer in hours. */
export function localTimeIn(
  tz: string,
  now: Date = new Date(),
  locale?: string
): { time: string; offsetHours: number } | null {
  if (!isValidTimeZone(tz)) return null;
  try {
    const time = new Intl.DateTimeFormat(locale, {
      timeZone: tz,
      hour: 'numeric',
      minute: '2-digit',
    }).format(now);
    const wallClock = (zone: string) => {
      const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: zone,
        hourCycle: 'h23',
        year: 'numeric',
        month: 'numeric',
        day: 'numeric',
        hour: 'numeric',
        minute: 'numeric',
      }).formatToParts(now);
      const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
      return Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'));
    };
    const viewerTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const offsetHours = (wallClock(tz) - wallClock(viewerTz)) / 3_600_000;
    return { time, offsetHours };
  } catch {
    return null;
  }
}

/** All IANA zones the browser knows, falling back to a short list on older engines. */
export function listTimeZones(): string[] {
  const intl = Intl as unknown as { supportedValuesOf?: (key: string) => string[] };
  try {
    const zones = intl.supportedValuesOf?.('timeZone');
    if (zones?.length) return zones.includes('UTC') ? zones : [...zones, 'UTC'];
  } catch {
    // fall through
  }
  return [
    'UTC',
    'America/Los_Angeles',
    'America/New_York',
    'America/Sao_Paulo',
    'Europe/London',
    'Europe/Berlin',
    'Europe/Moscow',
    'Asia/Kolkata',
    'Asia/Shanghai',
    'Asia/Tokyo',
    'Australia/Sydney',
  ];
}

export function browserTimeZone(): string | null {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return isValidTimeZone(tz) ? tz : null;
  } catch {
    return null;
  }
}
