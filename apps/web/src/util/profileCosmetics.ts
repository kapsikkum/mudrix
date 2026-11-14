/**
 * Mudrix-only profile fields: custom status, accent colour, avatar decoration, profile effect
 * and badges. They live in the user's extended profile (MSC4133) under `io.github.kapsikkum.mudrix.*` keys;
 * other clients ignore them. Pure helpers: every value read from a profile is untrusted, so
 * ids are mapped onto the built-in whitelists below and anything unknown is dropped. Nothing
 * here produces a URL, HTML or style string from remote data.
 */

const publicUrl = (path: string): string => `/${path}`;
import { getBuiltinFrame, getBuiltinNameplate } from '@/util/builtinCosmetics';
import {
  PROFILE_ACTIVITY_KEYS,
  parseActivityValue,
  type ProfileActivity,
} from '@/util/profileActivity';
import { firstKeyOf, legacyMudrixKey, mudrixKey } from '@/util/namespace';

// Each field is stored under its current name and the one earlier versions used. Reads take the
// first that is set; writes set both, so older clients keep seeing it.
const profileKeys = (name: string) => [mudrixKey(name), legacyMudrixKey(name)] as const;

export const PROFILE_STATUS_KEYS = profileKeys('status');
export const PROFILE_ACCENT_KEYS = profileKeys('accent');
export const PROFILE_AVATAR_DECORATION_KEYS = profileKeys('avatar_decoration');
export const PROFILE_EFFECT_KEYS = profileKeys('profile_effect');
export const PROFILE_NAMEPLATE_KEYS = profileKeys('nameplate');
export const PROFILE_FRAME_KEYS = profileKeys('profile_frame');
/**
 * Set to `true` automatically by every Mudrix client the account signs into (see
 * useEnsureMudrixUserFlag) - never user-editable, unlike the other Mudrix fields here.
 * A real, verifiable "this account uses Mudrix" signal instead of a self-picked badge.
 */
export const PROFILE_IS_MUDRIX_USER_KEYS = profileKeys('is_user');

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001F\u007F-\u009F\u202A-\u202E\u2066-\u2069]/g;

// --- Custom status ---------------------------------------------------------------------------

export type StatusMode = 'idle' | 'dnd';

export interface ProfileStatus {
  /** A single emoji, or '' */
  emoji: string;
  text: string;
  /** Overrides the presence dot colour on Mudrix clients; null leaves presence alone. */
  mode: StatusMode | null;
  /** Epoch ms after which Mudrix clients treat the status as cleared; null = never. */
  expiresAt: number | null;
}

export type StatusClearAfter = 'never' | '1h' | '4h' | 'today';

/** Expiry timestamp for a "clear after" choice, relative to `now`. */
export function statusExpiryFor(option: StatusClearAfter, now: number = Date.now()): number | null {
  if (option === '1h') return now + 3_600_000;
  if (option === '4h') return now + 4 * 3_600_000;
  if (option === 'today') {
    const end = new Date(now);
    end.setHours(24, 0, 0, 0);
    return end.getTime();
  }
  return null;
}

export function isStatusExpired(
  status: ProfileStatus | null | undefined,
  now: number = Date.now()
) {
  return !!status && status.expiresAt !== null && status.expiresAt <= now;
}

export const MAX_STATUS_TEXT_CHARS = 80;
const MAX_STATUS_EMOJI_UNITS = 32;

const EMOJI_RE = /\p{Extended_Pictographic}|\p{Regional_Indicator}/u;

interface SegmenterLike {
  segment(input: string): Iterable<{ segment: string }>;
}

function firstGrapheme(text: string): string {
  const Seg = (Intl as unknown as { Segmenter?: new (l?: string, o?: object) => SegmenterLike })
    .Segmenter;
  if (Seg) {
    for (const part of new Seg(undefined, { granularity: 'grapheme' }).segment(text)) {
      return part.segment;
    }
    return '';
  }
  return Array.from(text)[0] ?? '';
}

/** Keeps the first grapheme of `text` if it contains an emoji, otherwise ''. */
export function sanitizeStatusEmoji(text: string): string {
  const trimmed = text.replace(CONTROL_CHARS, '').trim();
  if (!trimmed) return '';
  const g = firstGrapheme(trimmed);
  if (!g || g.length > MAX_STATUS_EMOJI_UNITS || !EMOJI_RE.test(g)) return '';
  return g;
}

export function sanitizeStatusText(text: string): string {
  return Array.from(text.replace(CONTROL_CHARS, ' ').replace(/\s+/g, ' ').trim())
    .slice(0, MAX_STATUS_TEXT_CHARS)
    .join('');
}

export function parseStatusValue(value: unknown): ProfileStatus | null {
  if (!isRecord(value)) return null;
  const emoji = typeof value.emoji === 'string' ? sanitizeStatusEmoji(value.emoji) : '';
  const text = typeof value.text === 'string' ? sanitizeStatusText(value.text) : '';
  const mode = value.mode === 'idle' || value.mode === 'dnd' ? value.mode : null;
  if (!emoji && !text && !mode) return null;
  const expires = value.expires;
  const expiresAt =
    typeof expires === 'number' && Number.isFinite(expires) && expires > 0 ? expires : null;
  return { emoji, text, mode, expiresAt };
}

/** The value we write, or null to clear the field. */
export function statusToValue(
  status: ProfileStatus | null
): { emoji?: string; text?: string; mode?: StatusMode; expires?: number } | null {
  if (!status) return null;
  const emoji = sanitizeStatusEmoji(status.emoji);
  const text = sanitizeStatusText(status.text);
  if (!emoji && !text && !status.mode) return null;
  return {
    ...(emoji ? { emoji } : {}),
    ...(text ? { text } : {}),
    ...(status.mode ? { mode: status.mode } : {}),
    ...(status.expiresAt ? { expires: status.expiresAt } : {}),
  };
}

export function statusEquals(a: ProfileStatus | null, b: ProfileStatus | null): boolean {
  if (!a || !b) return a === b;
  return (
    a.emoji === b.emoji && a.text === b.text && a.mode === b.mode && a.expiresAt === b.expiresAt
  );
}

export type DotPresence = 'online' | 'unavailable' | 'offline' | 'dnd';

/**
 * Presence dot colour once the custom status mode is applied. Offline always wins (a user who
 * is not around is not "do not disturb"); with no presence data an explicit mode still shows.
 */
export function effectiveDotPresence(
  presence: 'online' | 'unavailable' | 'offline' | undefined,
  mode: StatusMode | null | undefined
): DotPresence | undefined {
  if (presence === 'offline') return 'offline';
  if (mode === 'dnd') return 'dnd';
  if (mode === 'idle') return 'unavailable';
  return presence;
}

// --- Accent colour ---------------------------------------------------------------------------

export const ACCENT_PRESETS = [
  '#5865f2',
  '#3b82f6',
  '#14b8a6',
  '#22c55e',
  '#eab308',
  '#f97316',
  '#ef4444',
  '#ec4899',
  '#a855f7',
  '#64748b',
] as const;

/** `#rgb`/`#rrggbb` (hash optional) -> lowercase `#rrggbb`, or null when not a hex colour. */
export function normalizeHex(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(value.trim());
  if (!m) return null;
  let hex = m[1].toLowerCase();
  if (hex.length === 3) hex = hex.replace(/./g, (c) => c + c);
  return `#${hex}`;
}

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHex(r: number, g: number, b: number): string {
  const part = (v: number) =>
    Math.round(Math.max(0, Math.min(255, v)))
      .toString(16)
      .padStart(2, '0');
  return `#${part(r)}${part(g)}${part(b)}`;
}

function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Black or white, whichever reads better on a solid `hex` background (WCAG contrast). */
export function readableTextColor(hex: string): '#ffffff' | '#111827' {
  return contrastRatio(hex, '#ffffff') >= contrastRatio(hex, '#111827') ? '#ffffff' : '#111827';
}

/** Blend `hex` towards black (amount < 0) or white (amount > 0). */
export function shadeHex(hex: string, amount: number): string {
  const target = amount < 0 ? 0 : 255;
  const k = Math.abs(amount);
  const [r, g, b] = hexToRgb(hex);
  return rgbToHex(r + (target - r) * k, g + (target - g) * k, b + (target - b) * k);
}

/** Header gradient for the profile card when the user has an accent and no banner. */
export function accentGradient(hex: string): string {
  return `linear-gradient(135deg, ${shadeHex(hex, 0.12)}, ${shadeHex(hex, -0.4)})`;
}

// --- Whitelisted cosmetics -------------------------------------------------------------------

export const BUILTIN_DECORATION_IDS = [
  'ring',
  'thorns',
  'sparkle',
  'flame',
  'pixel-hearts',
  'stars',
  'halo',
  'cat-ears',
  'bunny-ears',
  'crown',
  'leaf-wreath',
  'neon-ring',
  'glitch-ring',
  'snowflake-ring',
  'cherry-blossoms',
  'angel-wings',
  'devil-horns',
  'claude-buddy',
  'headphones',
  'rain-cloud',
  'butterflies',
  'orbiting-planets',
  'mud-splat',
  'grasping-hands',
  'corrupted-gaze',
  'uncanny-alternate',
] as const;

export const AVATAR_DECORATION_IDS = BUILTIN_DECORATION_IDS;
export type AvatarDecorationId = string;

const VALID_DECORATION_SET: Set<string> = new Set<string>(AVATAR_DECORATION_IDS);

export const BUILTIN_PROFILE_EFFECT_IDS = [
  'falling-stars',
  'hearts',
  'snow',
  'sparkles',
  'claude-sparks',
  'bubbles',
  'confetti',
  'fireflies',
  'autumn-leaves',
  'mud-splatter',
  'creeping-hands',
  'signal-intrusion',
  'broadcast-hijack',
  'eevee-stars',
] as const;
export type BuiltinProfileEffectId = (typeof BUILTIN_PROFILE_EFFECT_IDS)[number];

export const PROFILE_EFFECT_IDS = BUILTIN_PROFILE_EFFECT_IDS;
export type ProfileEffectId = string;

const VALID_PROFILE_EFFECT_SET: Set<string> = new Set<string>(PROFILE_EFFECT_IDS);

export function parseAvatarDecoration(value: unknown): AvatarDecorationId | null {
  if (typeof value !== 'string') return null;
  if (VALID_DECORATION_SET.has(value)) {
    return value as AvatarDecorationId;
  }
  if (value.startsWith('mxc://')) {
    return value as AvatarDecorationId;
  }
  return null;
}

export function parseProfileEffect(value: unknown): ProfileEffectId | null {
  if (typeof value !== 'string') return null;
  if (VALID_PROFILE_EFFECT_SET.has(value)) {
    return value as ProfileEffectId;
  }
  if (value.startsWith('mxc://')) {
    return value as ProfileEffectId;
  }
  return null;
}

export function profileEffectThumbnailSrc(_id: ProfileEffectId): string {
  return '';
}

export function parseIsMudrixUser(value: unknown): boolean {
  return value === true;
}

/** Asset path of a built-in decoration; an `mxc://` one is loaded with `useMediaBlobUrl`. */
export function avatarDecorationSrc(id: AvatarDecorationId): string {
  return id.startsWith('mxc://') ? '' : publicUrl(`assets/decorations/${id}.svg`);
}

export const NAMEPLATE_PALETTES: Record<string, string> = {
  none: '0, 0, 0',
  black: '0, 0, 0',
  crimson: '144, 0, 7',
  berry: '137, 58, 153',
  sky: '0, 128, 183',
  teal: '8, 100, 96',
  forest: '38, 47, 33',
  bubble_gum: '220, 62, 151',
  violet: '115, 11, 200',
  cobalt: '1, 49, 194',
  clover: '4, 123, 32',
  lemon: '246, 205, 18',
  white: '255, 255, 255',
};

export function nameplatePaletteRgb(palette?: string): string {
  if (!palette) return '0, 0, 0';
  return NAMEPLATE_PALETTES[palette.toLowerCase()] || '0, 0, 0';
}

export interface NameplateData {
  url: string;
  palette?: string;
}

export type NameplateId = string | NameplateData;

/**
 * Other people's profiles are untrusted input: only mxc:// media (or the id of a built-in
 * nameplate/frame, looked up in the shipped manifests) is ever accepted, so a profile can never
 * make a viewer's client fetch from an arbitrary host (which would leak their IP address).
 */
const isMxc = (v: unknown): v is string => typeof v === 'string' && v.startsWith('mxc://');

function parseJsonObject(value: string): Record<string, unknown> | null {
  if (!value.startsWith('{')) return null;
  try {
    const obj = JSON.parse(value);
    return obj && typeof obj === 'object' && !Array.isArray(obj) ? obj : null;
  } catch {
    return null;
  }
}

export function parseNameplate(value: unknown): NameplateId | null {
  if (!value) return null;
  const obj = typeof value === 'string' ? parseJsonObject(value) : value;
  if (typeof value === 'string' && !obj) {
    return isMxc(value) || getBuiltinNameplate(value) ? value : null;
  }
  if (!obj || typeof obj !== 'object') return null;
  const { url, palette } = obj as { url?: unknown; palette?: unknown };
  if (!isMxc(url)) return null;
  const out: NameplateData = { url };
  if (typeof palette === 'string' && palette.toLowerCase() in NAMEPLATE_PALETTES) {
    out.palette = palette.toLowerCase();
  }
  return out;
}

export interface ProfileFramePiece {
  layer?: 'back' | 'front';
  pos: string; // 'top' | 'bottom' | 'center'
  url: string;
}

export interface ProfileFrameData {
  url: string;
  pieces?: ProfileFramePiece[];
}

export type ProfileFrameId = string | ProfileFrameData;

const FRAME_POSITIONS = new Set(['top', 'bottom', 'center']);

function parseFramePieces(raw: unknown): ProfileFramePiece[] {
  if (!Array.isArray(raw)) return [];
  const pieces: ProfileFramePiece[] = [];
  for (const item of raw.slice(0, 8)) {
    if (!item || typeof item !== 'object') continue;
    const { url, pos, layer } = item as { url?: unknown; pos?: unknown; layer?: unknown };
    if (!isMxc(url) || typeof pos !== 'string' || !FRAME_POSITIONS.has(pos)) continue;
    pieces.push({ url, pos, ...(layer === 'back' || layer === 'front' ? { layer } : {}) });
  }
  return pieces;
}

export function parseProfileFrame(value: unknown): ProfileFrameId | null {
  if (!value) return null;
  const obj = typeof value === 'string' ? parseJsonObject(value) : value;
  if (typeof value === 'string' && !obj) {
    return isMxc(value) || getBuiltinFrame(value) ? value : null;
  }
  if (!obj || typeof obj !== 'object') return null;
  const { url, pieces } = obj as { url?: unknown; pieces?: unknown };
  const parsedPieces = parseFramePieces(pieces);
  if (!isMxc(url) && parsedPieces.length === 0) return null;
  return {
    ...(isMxc(url) ? { url } : { url: '' }),
    ...(parsedPieces.length > 0 ? { pieces: parsedPieces } : {}),
  };
}

export interface MudrixCosmetics {
  status: ProfileStatus | null;
  activities: ProfileActivity[];
  accent: string | null;
  avatarDecoration: AvatarDecorationId | null;
  profileEffect: ProfileEffectId | null;
  nameplate: NameplateId | null;
  profileFrame: ProfileFrameId | null;
  isMudrixUser: boolean;
}

export const EMPTY_COSMETICS: MudrixCosmetics = {
  status: null,
  activities: [],
  accent: null,
  avatarDecoration: null,
  profileEffect: null,
  nameplate: null,
  profileFrame: null,
  isMudrixUser: false,
};

export function parseCosmetics(raw: Record<string, unknown>): MudrixCosmetics {
  return {
    status: parseStatusValue(firstKeyOf(raw, PROFILE_STATUS_KEYS)),
    activities: parseActivityValue(firstKeyOf(raw, PROFILE_ACTIVITY_KEYS)),
    accent: normalizeHex(firstKeyOf(raw, PROFILE_ACCENT_KEYS)),
    avatarDecoration: parseAvatarDecoration(firstKeyOf(raw, PROFILE_AVATAR_DECORATION_KEYS)),
    profileEffect: parseProfileEffect(firstKeyOf(raw, PROFILE_EFFECT_KEYS)),
    nameplate: parseNameplate(firstKeyOf(raw, PROFILE_NAMEPLATE_KEYS)),
    profileFrame: parseProfileFrame(firstKeyOf(raw, PROFILE_FRAME_KEYS)),
    isMudrixUser: parseIsMudrixUser(firstKeyOf(raw, PROFILE_IS_MUDRIX_USER_KEYS)),
  };
}
