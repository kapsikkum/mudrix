import { atom } from 'jotai';
import type { UiDensity } from '@/theme/uiDensity';
import { atomWithStorage } from 'jotai/utils';
import { DEFAULT_THEME } from '@/theme/themes.css';
import { MOD_MODIFIER } from '@/app/util/platform';
import {
  STORAGE_KEY_THEME,
  STORAGE_KEY_MESSAGE_LAYOUT,
  STORAGE_KEY_PREFERENCES,
  STORAGE_KEY_KEYBINDS,
  STORAGE_KEY_LANGUAGE,
  STORAGE_KEY_DEVELOPER_MODE,
  STORAGE_KEY_MIC_MUTED,
  STORAGE_KEY_DEAFENED,
} from '@/const/storageKeys';

export type MessageLayout = 'classic' | 'modern' | 'compact';
export type ThemeName =
  | 'Carbon'
  | 'Pewter'
  | 'Parrot'
  | 'Hallow'
  | 'Garnet'
  | 'Ethereal'
  | 'Blossom';
export type MediaVisibility = 'always' | 'private' | 'never';
export type ReducedMotion = 'system' | 'on' | 'off';
export type ChatDensity = 'compact' | 'default' | 'spacious';
export type { UiDensity } from '@/theme/uiDensity';

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
  showPresence: boolean;
  showRoomAvatars: boolean;
  autoplayGifs: boolean;
  mediaVisibility: MediaVisibility;
  reducedMotion: ReducedMotion;
  chatFontSize: number;
  chatDensity: ChatDensity;
  uiDensity: UiDensity;
  reducedMotionApplied: boolean | null;
  themedAppIcon: boolean;
  excludeInsecureSessions: boolean;
  pushToTalk: boolean;
}

export const themeAtom = atomWithStorage<ThemeName>(STORAGE_KEY_THEME, DEFAULT_THEME as ThemeName);

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
  showPresence: false,
  showRoomAvatars: true,
  autoplayGifs: false,
  mediaVisibility: 'always',
  reducedMotion: 'system',
  chatFontSize: 15,
  chatDensity: 'default',
  uiDensity: 'default',
  reducedMotionApplied: null,
  themedAppIcon: false,
  excludeInsecureSessions: false,
  pushToTalk: false,
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
export const showPresenceAtom = preferenceFieldAtom('showPresence');
export const showRoomAvatarsAtom = preferenceFieldAtom('showRoomAvatars');
export const autoplayGifsAtom = preferenceFieldAtom('autoplayGifs');
export const mediaVisibilityAtom = preferenceFieldAtom('mediaVisibility');
export const reducedMotionAtom = preferenceFieldAtom('reducedMotion');
export const chatFontSizeAtom = preferenceFieldAtom('chatFontSize');
export const chatDensityAtom = preferenceFieldAtom('chatDensity');
export const uiDensityAtom = preferenceFieldAtom('uiDensity');
export const themedAppIconAtom = preferenceFieldAtom('themedAppIcon');
export const excludeInsecureSessionsAtom = preferenceFieldAtom('excludeInsecureSessions');
export const pushToTalkEnabledAtom = preferenceFieldAtom('pushToTalk');

const rawStringStorage = {
  getItem: (key: string, init: string) => localStorage.getItem(key) ?? init,
  setItem: (key: string, value: string) => localStorage.setItem(key, value),
  removeItem: (key: string) => localStorage.removeItem(key),
};

export const languageAtom = atomWithStorage<string>(STORAGE_KEY_LANGUAGE, 'en', rawStringStorage);

export const developerModeAtom = atomWithStorage<boolean>(STORAGE_KEY_DEVELOPER_MODE, false);

export const micMutedAtom = atomWithStorage<boolean>(STORAGE_KEY_MIC_MUTED, false);

export const deafenedAtom = atomWithStorage<boolean>(STORAGE_KEY_DEAFENED, false);
