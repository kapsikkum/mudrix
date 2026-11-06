import { atom } from 'jotai';
import type { UiDensity, UiScale } from '@/theme/uiDensity';
import { atomWithStorage } from 'jotai/utils';
import { DEFAULT_THEME } from '@/theme/themes.css';
import type { CustomTheme } from '@/theme/customThemes';
import type { ThemeName } from '@/theme/themeTokens';
import { MOD_MODIFIER } from '@/app/util/platform';
import {
  STORAGE_KEY_THEME,
  STORAGE_KEY_CUSTOM_THEMES,
  STORAGE_KEY_MESSAGE_LAYOUT,
  STORAGE_KEY_PREFERENCES,
  STORAGE_KEY_KEYBINDS,
  STORAGE_KEY_LANGUAGE,
  STORAGE_KEY_DEVELOPER_MODE,
  STORAGE_KEY_MIC_MUTED,
  STORAGE_KEY_DEAFENED,
} from '@/const/storageKeys';

export type MessageLayout = 'classic' | 'modern' | 'compact';
export type { ThemeName } from '@/theme/themeTokens';
export type MediaVisibility = 'always' | 'private' | 'never';
export type ReducedMotion = 'system' | 'on' | 'off';
export type ChatDensity = 'compact' | 'default' | 'spacious';
export type { UiDensity, UiScale } from '@/theme/uiDensity';

export interface Keybinds {
  toggleMute: string;
  toggleDeafen: string;
  pushToTalk: string;
}

export const DEFAULT_KEYBINDS: Keybinds = {
  toggleMute: `${MOD_MODIFIER}+Shift+KeyM`,
  toggleDeafen: `${MOD_MODIFIER}+Shift+KeyD`,
  pushToTalk: '',
};

export interface Preferences {
  typingIndicators: boolean;
  notificationSounds: boolean;
  notificationBanners: boolean;
  sendReadReceipts: boolean;
  prettifyLinks: boolean;
  markdown: boolean;
  showRoomAvatars: boolean;
  showPresenceDots: boolean;
  colorUsernames: boolean;
  autoplayGifs: boolean;
  mediaVisibility: MediaVisibility;
  reducedMotion: ReducedMotion;
  chatFontSize: number;
  chatDensity: ChatDensity;
  uiDensity: UiDensity;
  uiScale: UiScale;
  reducedMotionApplied: boolean | null;
  themedAppIcon: boolean;
  excludeInsecureSessions: boolean;
  pushToTalk: boolean;
  followSystemTheme: boolean;
  systemDarkTheme: ThemeName;
  systemLightTheme: ThemeName;
}

export const themeAtom = atomWithStorage<ThemeName>(STORAGE_KEY_THEME, DEFAULT_THEME);

/** Themes the user made; the theme atom refers to one as custom:<id> */
export const customThemesAtom = atomWithStorage<CustomTheme[]>(STORAGE_KEY_CUSTOM_THEMES, []);

export const messageLayoutAtom = atomWithStorage<MessageLayout>(
  STORAGE_KEY_MESSAGE_LAYOUT,
  'modern'
);

export const keybindsAtom = atomWithStorage<Keybinds>(STORAGE_KEY_KEYBINDS, DEFAULT_KEYBINDS);

export const DEFAULT_PREFERENCES: Preferences = {
  typingIndicators: true,
  notificationSounds: true,
  notificationBanners: false,
  sendReadReceipts: true,
  prettifyLinks: false,
  markdown: true,
  showRoomAvatars: true,
  showPresenceDots: true,
  colorUsernames: true,
  autoplayGifs: false,
  mediaVisibility: 'always',
  reducedMotion: 'system',
  chatFontSize: 15,
  chatDensity: 'default',
  uiDensity: 'default',
  uiScale: 'auto',
  reducedMotionApplied: null,
  themedAppIcon: false,
  excludeInsecureSessions: false,
  pushToTalk: false,
  followSystemTheme: false,
  systemDarkTheme: 'Carbon',
  systemLightTheme: 'Ethereal',
};

export const preferencesAtom = atomWithStorage<Preferences>(
  STORAGE_KEY_PREFERENCES,
  DEFAULT_PREFERENCES
);

function preferenceFieldAtom<K extends keyof Preferences>(key: K) {
  return atom(
    (get) => get(preferencesAtom)[key] ?? DEFAULT_PREFERENCES[key],
    (_get, set, value: Preferences[K]) =>
      set(preferencesAtom, (prev) => ({ ...prev, [key]: value }))
  );
}

export const typingIndicatorsAtom = preferenceFieldAtom('typingIndicators');
export const notificationSoundsAtom = preferenceFieldAtom('notificationSounds');
export const notificationBannersAtom = preferenceFieldAtom('notificationBanners');
export const sendReadReceiptsAtom = preferenceFieldAtom('sendReadReceipts');
export const prettifyLinksAtom = preferenceFieldAtom('prettifyLinks');
export const markdownAtom = preferenceFieldAtom('markdown');
export const showRoomAvatarsAtom = preferenceFieldAtom('showRoomAvatars');
export const showPresenceDotsAtom = preferenceFieldAtom('showPresenceDots');
export const colorUsernamesAtom = preferenceFieldAtom('colorUsernames');
export const autoplayGifsAtom = preferenceFieldAtom('autoplayGifs');
export const mediaVisibilityAtom = preferenceFieldAtom('mediaVisibility');
export const reducedMotionAtom = preferenceFieldAtom('reducedMotion');
export const chatFontSizeAtom = preferenceFieldAtom('chatFontSize');
export const chatDensityAtom = preferenceFieldAtom('chatDensity');
export const uiDensityAtom = preferenceFieldAtom('uiDensity');
export const uiScaleAtom = preferenceFieldAtom('uiScale');
export const touchUiAtom = atom(false);
export const themedAppIconAtom = preferenceFieldAtom('themedAppIcon');
export const excludeInsecureSessionsAtom = preferenceFieldAtom('excludeInsecureSessions');
export const pushToTalkEnabledAtom = preferenceFieldAtom('pushToTalk');
export const followSystemThemeAtom = preferenceFieldAtom('followSystemTheme');
export const systemDarkThemeAtom = preferenceFieldAtom('systemDarkTheme');
export const systemLightThemeAtom = preferenceFieldAtom('systemLightTheme');

const prefersDarkQuery =
  typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-color-scheme: dark)')
    : null;

/** Live view of the OS colour scheme (true = dark). */
export const systemPrefersDarkAtom = (() => {
  const base = atom<boolean>(prefersDarkQuery?.matches ?? true);
  base.onMount = (set) => {
    if (!prefersDarkQuery) return undefined;
    set(prefersDarkQuery.matches);
    const listener = (e: MediaQueryListEvent) => set(e.matches);
    prefersDarkQuery.addEventListener('change', listener);
    return () => prefersDarkQuery.removeEventListener('change', listener);
  };
  return base;
})();

/** The theme actually applied: the manual choice, or the system-mapped one when following the OS. */
export const effectiveThemeAtom = atom<ThemeName>((get) => {
  if (!get(followSystemThemeAtom)) return get(themeAtom);
  return get(systemPrefersDarkAtom) ? get(systemDarkThemeAtom) : get(systemLightThemeAtom);
});

const rawStringStorage = {
  getItem: (key: string, init: string) => localStorage.getItem(key) ?? init,
  setItem: (key: string, value: string) => localStorage.setItem(key, value),
  removeItem: (key: string) => localStorage.removeItem(key),
};

export const languageAtom = atomWithStorage<string>(STORAGE_KEY_LANGUAGE, 'en', rawStringStorage);

export const developerModeAtom = atomWithStorage<boolean>(STORAGE_KEY_DEVELOPER_MODE, false);

export const micMutedAtom = atomWithStorage<boolean>(STORAGE_KEY_MIC_MUTED, false);

export const deafenedAtom = atomWithStorage<boolean>(STORAGE_KEY_DEAFENED, false);
