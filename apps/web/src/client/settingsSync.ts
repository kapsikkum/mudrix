import type { Keybinds, MessageLayout, Preferences, ThemeName } from '@/app/store/atoms';
import { DEFAULT_KEYBINDS, DEFAULT_PREFERENCES } from '@/app/store/atoms/settings';
import { THEMES } from '@/theme/themes.css';
import { EMOJI_ONLY_SIZES, EMOJI_STYLES } from '@/util/emojiStyle';
import { isCustomThemeId, sanitizeCustomThemes, type CustomTheme } from '@/theme/customThemes';
import { legacyMudrixKey, mudrixKey, wizardchatKey } from '@/util/namespace';

/**
 * Privacy model: this is Matrix *account data*. Other users can never read it (it is not part of
 * any room or profile), but it is not end-to-end encrypted, so the homeserver admin can. Only
 * non-secret appearance/behaviour choices belong here. Never add tokens, keys, GIF favourites
 * (an encrypted GIF favourite carries its decryption key) or anything that identifies private
 * rooms. Anything other users should see goes in the extended profile instead, deliberately.
 */
export const SETTINGS_ACCOUNT_DATA_TYPE = mudrixKey('settings');

/**
 * Where earlier Mudrix versions kept the settings. Every save also writes it, so a device that
 * has not updated yet keeps following the account's settings. Because current versions always
 * write both, the two only differ when one of those older devices changed something, which makes
 * this copy the fresher one: it is read first.
 */
export const PREVIOUS_SETTINGS_ACCOUNT_DATA_TYPE = legacyMudrixKey('settings');

/** Every name a save writes. */
export const SETTINGS_WRITE_TYPES = [
  SETTINGS_ACCOUNT_DATA_TYPE,
  PREVIOUS_SETTINGS_ACCOUNT_DATA_TYPE,
] as const;

/** The settings of the WizardChat base this app is built on (flat, not nested). */
export const WIZARDCHAT_SETTINGS_ACCOUNT_DATA_TYPE = wizardchatKey('settings');

/** The older WizardChat web app's event. */
export const LEGACY_SETTINGS_ACCOUNT_DATA_TYPE = 'io.gitlab.wizardchat.settings';

/**
 * Every settings event, best source first. The WizardChat ones are only a fallback until the first
 * save writes a Mudrix event, and are never written: an account signed in to both apps must not
 * have one overwrite the other's settings.
 */
export const SETTINGS_READ_TYPES = [
  PREVIOUS_SETTINGS_ACCOUNT_DATA_TYPE,
  SETTINGS_ACCOUNT_DATA_TYPE,
  WIZARDCHAT_SETTINGS_ACCOUNT_DATA_TYPE,
  LEGACY_SETTINGS_ACCOUNT_DATA_TYPE,
] as const;

/** The content of each settings event the account has, by event type. */
export type SettingsContents = Partial<Record<string, unknown>>;

/** Preferences that describe this device (screen size, ...) and so are not synced. */
const DEVICE_ONLY_PREFERENCES: ReadonlySet<keyof Preferences> = new Set([
  'uiScale',
  'uiZoom',
  // Whether this computer is being streamed is a fact about this computer.
  'streamerMode',
  'reducedMotionApplied',
  // Needs the operating system's permission, which is granted per device.
  'notificationBanners',
]);

export interface SyncedSettings {
  theme: ThemeName;
  customThemes: CustomTheme[];
  messageLayout: MessageLayout;
  /** Layout for phones, synced separately so a phone never changes the desktop layout or back. */
  messageLayoutMobile?: MessageLayout;
  language: string;
  preferences: Partial<Preferences>;
  keybinds: Keybinds;
}

const MESSAGE_LAYOUTS: MessageLayout[] = ['classic', 'modern', 'compact'];
const ENUM_VALUES: Partial<Record<keyof Preferences, readonly string[]>> = {
  mediaVisibility: ['always', 'private', 'never'],
  videoUploadMode: ['original', 'smart', 'fixed'],
  videoUploadHeight: ['1080', '720', '480'],
  videoUploadTarget: ['25', '50', '100', 'server'],
  videoUploadMinSize: ['10', '25', '50', '100'],
  photoUploadSize: ['original', '2560', '1920', '1280'],
  youtubeEmbeds: ['ask', 'on', 'off'],
  gifProvider: ['giphy', 'klipy'],
  reducedMotion: ['system', 'on', 'off'],
  chatDensity: ['compact', 'default', 'spacious'],
  uiDensity: ['compact', 'default', 'spacious'],
  streamerMode: ['off', 'on', 'auto'],
  timeFormat: ['auto', '12h', '24h'],
  dateFormat: ['long', 'dmy', 'mdy', 'ymd'],
  emojiStyle: EMOJI_STYLES,
  emojiOnlySize: EMOJI_ONLY_SIZES,
  systemDarkTheme: Object.keys(THEMES),
  systemLightTheme: Object.keys(THEMES),
};

export function isSyncedPreference(key: string): key is keyof Preferences {
  return key in DEFAULT_PREFERENCES && !DEVICE_ONLY_PREFERENCES.has(key as keyof Preferences);
}

/** Keeps only known, synced preference keys whose value has the right type and an allowed value. */
export function sanitizePreferences(raw: unknown): Partial<Preferences> {
  if (!raw || typeof raw !== 'object') return {};
  const input = raw as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(DEFAULT_PREFERENCES)) {
    if (!isSyncedPreference(key) || !(key in input)) continue;
    const value = input[key];
    const expected = DEFAULT_PREFERENCES[key];
    if (typeof value !== typeof expected) continue;
    if (typeof value === 'number' && !Number.isFinite(value)) continue;
    const allowed = ENUM_VALUES[key];
    const isCustomThemePick =
      (key === 'systemDarkTheme' || key === 'systemLightTheme') && isCustomThemeId(value);
    if (allowed && !isCustomThemePick && !allowed.includes(value as string)) continue;
    out[key] = value;
  }
  return out as Partial<Preferences>;
}

function sanitizeKeybinds(raw: unknown): Keybinds | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const input = raw as Record<string, unknown>;
  const out: Keybinds = { ...DEFAULT_KEYBINDS };
  let found = false;
  for (const key of Object.keys(out) as (keyof Keybinds)[]) {
    const value = input[key];
    if (typeof value === 'string' && value.length <= 64) {
      out[key] = value;
      found = true;
    }
  }
  return found ? out : undefined;
}

/** The synced subset of the current local preferences, filled with defaults for missing keys. */
export function syncablePreferences(prefs: Partial<Preferences>): Partial<Preferences> {
  return sanitizePreferences({ ...DEFAULT_PREFERENCES, ...prefs });
}

export function parseSettings(raw: unknown): Partial<SyncedSettings> {
  if (!raw || typeof raw !== 'object') return {};
  const content = raw as Record<string, unknown>;
  const settings: Partial<SyncedSettings> = {};

  if (
    typeof content.theme === 'string' &&
    (content.theme in THEMES || isCustomThemeId(content.theme))
  ) {
    settings.theme = content.theme as ThemeName;
  }

  if (Array.isArray(content.customThemes)) {
    settings.customThemes = sanitizeCustomThemes(content.customThemes);
  }

  if (
    typeof content.messageLayout === 'string' &&
    (MESSAGE_LAYOUTS as string[]).includes(content.messageLayout)
  ) {
    settings.messageLayout = content.messageLayout as MessageLayout;
  }

  if (
    typeof content.messageLayoutMobile === 'string' &&
    (MESSAGE_LAYOUTS as string[]).includes(content.messageLayoutMobile)
  ) {
    settings.messageLayoutMobile = content.messageLayoutMobile as MessageLayout;
  }

  if (typeof content.language === 'string' && content.language.trim() !== '') {
    settings.language = content.language;
  }

  // The WizardChat base keeps the preferences next to the theme instead of in a `preferences` object
  const nested =
    content.preferences && typeof content.preferences === 'object' ? content.preferences : {};
  const preferences = sanitizePreferences({ ...content, ...nested });
  if (Object.keys(preferences).length > 0) settings.preferences = preferences;

  const keybinds = sanitizeKeybinds(content.keybinds);
  if (keybinds) settings.keybinds = keybinds;

  return settings;
}

/** The first settings event the account has, in the order of `SETTINGS_READ_TYPES`. */
export function pickSettingsContent(contents: SettingsContents): unknown {
  return SETTINGS_READ_TYPES.map((type) => contents[type]).find(
    (content) => content && typeof content === 'object'
  );
}

/** The settings the account has saved (empty when it has none). */
export function readSettings(contents: SettingsContents): Partial<SyncedSettings> {
  return parseSettings(pickSettingsContent(contents));
}

/** Whether this account has saved Mudrix settings yet (as opposed to only WizardChat's). */
export function hasMudrixSettings(contents: SettingsContents): boolean {
  return SETTINGS_WRITE_TYPES.some((type) => contents[type] && typeof contents[type] === 'object');
}

function stable(value: unknown): string {
  if (!value || typeof value !== 'object') return JSON.stringify(value ?? null);
  const obj = value as Record<string, unknown>;
  return `{${Object.keys(obj)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${stable(obj[k])}`)
    .join(',')}}`;
}

export function settingsEqual(a: Partial<SyncedSettings>, b: Partial<SyncedSettings>): boolean {
  return stable(a) === stable(b);
}

/**
 * What to write to the settings event `type`: the content already stored there with only the keys
 * that differ from `current` replaced. Keys this version does not know (written by another app or
 * a newer version) and values nothing here changed are kept instead of being overwritten with
 * this device's copy. With no saved Mudrix settings yet, everything is written.
 */
export function mergeSettingsForWrite(
  contents: SettingsContents,
  type: string,
  next: Partial<SyncedSettings>,
  current: Partial<SyncedSettings>,
  writeAll: boolean
): Record<string, unknown> {
  // A name nothing has been saved under yet starts from the other one, so it is not left partial.
  const stored = [type, ...SETTINGS_WRITE_TYPES]
    .map((name) => contents[name])
    .find((content) => content && typeof content === 'object');
  const base: Record<string, unknown> =
    stored && typeof stored === 'object' ? { ...(stored as Record<string, unknown>) } : {};
  const isChanged = (a: unknown, b: unknown) => writeAll || stable(a) !== stable(b);

  for (const key of Object.keys(next) as (keyof SyncedSettings)[]) {
    if (key === 'preferences') continue;
    if (isChanged(next[key], current[key])) base[key] = next[key];
  }

  const nextPrefs = next.preferences ?? {};
  const currentPrefs = current.preferences ?? {};
  const storedPrefs = base.preferences;
  const prefs: Record<string, unknown> =
    storedPrefs && typeof storedPrefs === 'object' ? { ...(storedPrefs as object) } : {};
  for (const key of Object.keys(nextPrefs) as (keyof Preferences)[]) {
    if (isChanged(nextPrefs[key], currentPrefs[key])) prefs[key] = nextPrefs[key];
  }
  if (next.preferences) base.preferences = prefs;
  return base;
}
