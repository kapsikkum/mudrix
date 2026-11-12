import { atom } from 'jotai';
import { MOD_MODIFIER } from '@/app/util/platform';
import type { UiDensity, UiScale } from '@/theme/uiDensity';
import {
  DEFAULT_EMOJI_ONLY_SIZE,
  DEFAULT_EMOJI_STYLE,
  type EmojiOnlySize,
  type EmojiStyle,
} from '@/util/emojiStyle';
import { atomWithStorage } from 'jotai/utils';
import { DEFAULT_THEME } from '@/theme/themes.css';
import type { CustomTheme } from '@/theme/customThemes';
import { DEFAULT_SOUND_PACK, type SoundKind } from '@/util/notificationSounds';
import type { ThemeName } from '@/theme/themeTokens';
import {
  STORAGE_KEY_THEME,
  STORAGE_KEY_CUSTOM_THEMES,
  STORAGE_KEY_MESSAGE_LAYOUT,
  STORAGE_KEY_MESSAGE_LAYOUT_MOBILE,
  STORAGE_KEY_PREFERENCES,
  STORAGE_KEY_KEYBINDS,
  STORAGE_KEY_LANGUAGE,
  STORAGE_KEY_DEVELOPER_MODE,
  STORAGE_KEY_MIC_MUTED,
  STORAGE_KEY_DEAFENED,
} from '@/const/storageKeys';

export type MessageLayout = 'classic' | 'modern' | 'compact';
export type { ThemeName } from '@/theme/themeTokens';
export type TimeFormatPreference = 'auto' | '12h' | '24h';
export type DateFormatPreference = 'long' | 'dmy' | 'mdy' | 'ymd';
/** Streamer mode: hide private details always, or only while this device shares its screen. */
export type StreamerMode = 'off' | 'on' | 'auto';
export type MediaVisibility = 'always' | 'private' | 'never';
/** Videos sent as they are, shrunk to fit a size (smart), or shrunk to one fixed resolution. */
export type VideoUploadMode = 'original' | 'smart' | 'fixed';
export type VideoUploadHeight = '1080' | '720' | '480';
/** Size a smart upload aims for, in MB, or whatever the server allows. */
export type VideoUploadTarget = '25' | '50' | '100' | 'server';
/** Videos smaller than this many MB are never re-encoded. */
export type VideoUploadMinSize = '10' | '25' | '50' | '100';
/** Longest side, in pixels, bigger photos are scaled down to before sending; 'original' keeps them. */
export type PhotoUploadSize = 'original' | '2560' | '1920' | '1280';
/** YouTube link embeds: asked once, then on (cards that can play) or off (no embed at all). */
export type YouTubeEmbeds = 'ask' | 'on' | 'off';
/** Which service the GIF picker opens on. */
export type GifProviderPreference = 'giphy' | 'klipy';
export type ReducedMotion = 'system' | 'on' | 'off';
export type ChatDensity = 'compact' | 'default' | 'spacious';
export type { UiDensity, UiScale } from '@/theme/uiDensity';

export interface Keybinds {
  toggleMute: string;
  toggleDeafen: string;
  toggleVideo: string;
  disconnect: string;
  toggleScreenShare?: string;
  pushToTalk: string;
}

export const DEFAULT_KEYBINDS: Keybinds = {
  toggleMute: '',
  toggleDeafen: '',
  toggleVideo: '',
  disconnect: '',
  toggleScreenShare: `${MOD_MODIFIER}+Shift+KeyE`,
  pushToTalk: '',
};

export interface Preferences {
  slidingSync: boolean;
  typingIndicators: boolean;
  notificationSounds: boolean;
  /** Whether message sounds also play while the app is the window being looked at. */
  notificationSoundsWhenFocused: boolean;
  /** Sound pack for everything without an override of its own. */
  notificationSoundPack: string;
  /** Legacy mention pack; read as soundOverrides.mention (see soundOverridesAtom). */
  notificationMentionSoundPack: string;
  /** 0-100, for message, mention and call sounds. */
  notificationSoundVolume: number;
  /** Per sound: a pack id, or 'off'. A missing key follows notificationSoundPack. */
  soundOverrides: Partial<Record<SoundKind, string>>;
  notificationBanners: boolean;
  sendReadReceipts: boolean;
  prettifyLinks: boolean;
  markdown: boolean;
  showRoomAvatars: boolean;
  showPresenceDots: boolean;
  colorUsernames: boolean;
  autoplayGifs: boolean;
  /** Show images sent together as one gallery instead of one message each. */
  groupImages: boolean;
  mediaVisibility: MediaVisibility;
  videoUploadMode: VideoUploadMode;
  videoUploadHeight: VideoUploadHeight;
  videoUploadTarget: VideoUploadTarget;
  videoUploadMinSize: VideoUploadMinSize;
  /** Remove location, camera and other embedded details from photos before sending. */
  photoStripMetadata: boolean;
  photoUploadSize: PhotoUploadSize;
  youtubeEmbeds: YouTubeEmbeds;
  gifProvider: GifProviderPreference;
  reducedMotion: ReducedMotion;
  chatFontSize: number;
  chatDensity: ChatDensity;
  uiDensity: UiDensity;
  uiScale: UiScale;
  reducedMotionApplied: boolean | null;
  themedAppIcon: boolean;
  excludeInsecureSessions: boolean;
  pushToTalk: boolean;
  /** Page zoom in percent (75-150); describes this device, so it is not synced. */
  uiZoom: number;
  timeFormat: TimeFormatPreference;
  dateFormat: DateFormatPreference;
  useSystemAccent: boolean;
  hideMembershipEvents: boolean;
  hideProfileEvents: boolean;
  profileEffects: boolean;
  /** Which colour emoji font draws emoji */
  emojiStyle: EmojiStyle;
  /** Font size of messages that are only emoji */
  emojiOnlySize: EmojiOnlySize;
  /** Turn plain-text emoticons like :) into emoji when sending */
  emoticonsToEmoji: boolean;
  /** Fade new messages in as they arrive */
  messageSendAnimation: boolean;
  streamerMode: StreamerMode;
  /** Share whether you are online (off: you appear offline and nobody's presence is shown) */
  showPresence: boolean;
  /** Desktop app: show the game or music playing on this computer on your profile */
  shareActivity: boolean;
  shareActivityGames: boolean;
  shareActivityMusic: boolean;
  /** Games the person hid from their profile, by lower-case name */
  hiddenActivities: string[];
  /** Programs added by hand: when `exe` is running it counts as the game `name` */
  customActivityApps: { exe: string; name: string }[];
  /** Ask a person's homeserver what software it runs and show it as a badge on their profile */
  showHomeserverSoftware: boolean;
  followSystemTheme: boolean;
  systemDarkTheme: ThemeName;
  systemLightTheme: ThemeName;
  /** Microphone processing the browser applies before the call hears you */
  noiseSuppression: boolean;
  echoCancellation: boolean;
  autoGainControl: boolean;
  /** Soundboard: hear and play clips in calls. Device-only (see settingsSync). */
  soundboardEnabled: boolean;
  /** 0-100, separate from voice and notification volume. Device-only. */
  soundboardVolume: number;
  /** User ids whose soundboard clips are muted on this device. Device-only. */
  soundboardMutedUsers: string[];
  /** Let people who manage a space move me from one of its voice channels to another. */
  allowVoiceMoves: boolean;
  voiceSounds: Partial<Record<string, boolean>>;
}

export const themeAtom = atomWithStorage<ThemeName>(STORAGE_KEY_THEME, DEFAULT_THEME);

/** Themes the user made; the theme atom refers to one as custom:<id> */
export const customThemesAtom = atomWithStorage<CustomTheme[]>(STORAGE_KEY_CUSTOM_THEMES, []);

export const messageLayoutAtom = atomWithStorage<MessageLayout>(
  STORAGE_KEY_MESSAGE_LAYOUT,
  'modern'
);

/** Message layout used on phones; null until chosen, when phones follow the main layout. */
export const messageLayoutMobileAtom = atomWithStorage<MessageLayout | null>(
  STORAGE_KEY_MESSAGE_LAYOUT_MOBILE,
  null
);

export const keybindsAtom = atomWithStorage<Keybinds>(STORAGE_KEY_KEYBINDS, DEFAULT_KEYBINDS);

export const DEFAULT_PREFERENCES: Preferences = {
  slidingSync: false,
  typingIndicators: true,
  notificationSounds: true,
  notificationSoundsWhenFocused: false,
  notificationSoundPack: DEFAULT_SOUND_PACK,
  notificationMentionSoundPack: '',
  notificationSoundVolume: 70,
  soundOverrides: {},
  notificationBanners: false,
  sendReadReceipts: true,
  prettifyLinks: false,
  markdown: true,
  showRoomAvatars: true,
  showPresenceDots: true,
  colorUsernames: true,
  autoplayGifs: false,
  groupImages: true,
  mediaVisibility: 'always',
  videoUploadMode: 'original',
  videoUploadHeight: '720',
  videoUploadTarget: '50',
  videoUploadMinSize: '25',
  photoStripMetadata: false,
  photoUploadSize: 'original',
  youtubeEmbeds: 'ask',
  gifProvider: 'giphy',
  reducedMotion: 'system',
  chatFontSize: 15,
  chatDensity: 'default',
  uiDensity: 'default',
  uiScale: 'auto',
  reducedMotionApplied: null,
  themedAppIcon: false,
  excludeInsecureSessions: false,
  pushToTalk: false,
  uiZoom: 100,
  useSystemAccent: false,
  hideMembershipEvents: false,
  hideProfileEvents: true,
  timeFormat: 'auto',
  dateFormat: 'long',
  profileEffects: true,
  emojiStyle: DEFAULT_EMOJI_STYLE,
  emojiOnlySize: DEFAULT_EMOJI_ONLY_SIZE,
  emoticonsToEmoji: true,
  messageSendAnimation: false,
  streamerMode: 'auto',
  showPresence: false,
  shareActivity: false,
  shareActivityGames: true,
  shareActivityMusic: true,
  hiddenActivities: [],
  customActivityApps: [],
  showHomeserverSoftware: true,
  followSystemTheme: false,
  systemDarkTheme: 'Carbon',
  systemLightTheme: 'Ethereal',
  noiseSuppression: true,
  echoCancellation: true,
  autoGainControl: true,
  soundboardEnabled: true,
  soundboardVolume: 70,
  soundboardMutedUsers: [],
  allowVoiceMoves: true,
  voiceSounds: {},
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

export const shareActivityAtom = preferenceFieldAtom('shareActivity');
export const shareActivityGamesAtom = preferenceFieldAtom('shareActivityGames');
export const shareActivityMusicAtom = preferenceFieldAtom('shareActivityMusic');
export const hiddenActivitiesAtom = preferenceFieldAtom('hiddenActivities');
export const customActivityAppsAtom = preferenceFieldAtom('customActivityApps');
export const slidingSyncAtom = preferenceFieldAtom('slidingSync');
export const typingIndicatorsAtom = preferenceFieldAtom('typingIndicators');
export const notificationSoundsAtom = preferenceFieldAtom('notificationSounds');
export const notificationSoundsWhenFocusedAtom = preferenceFieldAtom(
  'notificationSoundsWhenFocused'
);
export const notificationSoundPackAtom = preferenceFieldAtom('notificationSoundPack');
export const notificationSoundVolumeAtom = preferenceFieldAtom('notificationSoundVolume');
export const notificationBannersAtom = preferenceFieldAtom('notificationBanners');
export const sendReadReceiptsAtom = preferenceFieldAtom('sendReadReceipts');
export const prettifyLinksAtom = preferenceFieldAtom('prettifyLinks');
export const markdownAtom = preferenceFieldAtom('markdown');
export const showRoomAvatarsAtom = preferenceFieldAtom('showRoomAvatars');
export const showPresenceDotsAtom = preferenceFieldAtom('showPresenceDots');
export const colorUsernamesAtom = preferenceFieldAtom('colorUsernames');
export const autoplayGifsAtom = preferenceFieldAtom('autoplayGifs');
export const groupImagesAtom = preferenceFieldAtom('groupImages');
export const mediaVisibilityAtom = preferenceFieldAtom('mediaVisibility');
export const videoUploadModeAtom = preferenceFieldAtom('videoUploadMode');
export const videoUploadHeightAtom = preferenceFieldAtom('videoUploadHeight');
export const videoUploadTargetAtom = preferenceFieldAtom('videoUploadTarget');
export const videoUploadMinSizeAtom = preferenceFieldAtom('videoUploadMinSize');
export const photoStripMetadataAtom = preferenceFieldAtom('photoStripMetadata');
export const photoUploadSizeAtom = preferenceFieldAtom('photoUploadSize');
export const youtubeEmbedsAtom = preferenceFieldAtom('youtubeEmbeds');
export const gifProviderAtom = preferenceFieldAtom('gifProvider');
export const reducedMotionAtom = preferenceFieldAtom('reducedMotion');
export const chatFontSizeAtom = preferenceFieldAtom('chatFontSize');
export const chatDensityAtom = preferenceFieldAtom('chatDensity');
export const uiDensityAtom = preferenceFieldAtom('uiDensity');
export const uiScaleAtom = preferenceFieldAtom('uiScale');
export const touchUiAtom = atom(false);
export const themedAppIconAtom = preferenceFieldAtom('themedAppIcon');
export const excludeInsecureSessionsAtom = preferenceFieldAtom('excludeInsecureSessions');
export const pushToTalkEnabledAtom = preferenceFieldAtom('pushToTalk');
export const uiZoomAtom = preferenceFieldAtom('uiZoom');
export const useSystemAccentAtom = preferenceFieldAtom('useSystemAccent');
export const hideMembershipEventsAtom = preferenceFieldAtom('hideMembershipEvents');
export const hideProfileEventsAtom = preferenceFieldAtom('hideProfileEvents');
export const timeFormatAtom = preferenceFieldAtom('timeFormat');
export const dateFormatAtom = preferenceFieldAtom('dateFormat');
export const profileEffectsAtom = preferenceFieldAtom('profileEffects');
export const emojiStyleAtom = preferenceFieldAtom('emojiStyle');
export const emojiOnlySizeAtom = preferenceFieldAtom('emojiOnlySize');
export const emoticonsToEmojiAtom = preferenceFieldAtom('emoticonsToEmoji');
export const messageSendAnimationAtom = preferenceFieldAtom('messageSendAnimation');
export const streamerModeAtom = preferenceFieldAtom('streamerMode');
export const showPresenceAtom = preferenceFieldAtom('showPresence');
export const showHomeserverSoftwareAtom = preferenceFieldAtom('showHomeserverSoftware');
export const followSystemThemeAtom = preferenceFieldAtom('followSystemTheme');
export const systemDarkThemeAtom = preferenceFieldAtom('systemDarkTheme');
export const systemLightThemeAtom = preferenceFieldAtom('systemLightTheme');
export const noiseSuppressionAtom = preferenceFieldAtom('noiseSuppression');
export const echoCancellationAtom = preferenceFieldAtom('echoCancellation');
export const autoGainControlAtom = preferenceFieldAtom('autoGainControl');
export const soundboardEnabledAtom = preferenceFieldAtom('soundboardEnabled');
export const soundboardVolumeAtom = preferenceFieldAtom('soundboardVolume');
export const soundboardMutedUsersAtom = preferenceFieldAtom('soundboardMutedUsers');
export const allowVoiceMovesAtom = preferenceFieldAtom('allowVoiceMoves');

/**
 * Per-sound pack overrides. Reads fold in the legacy notificationMentionSoundPack as the mention
 * override; writes clear it so removing the override sticks.
 */
export const soundOverridesAtom = atom(
  (get) => {
    const prefs = get(preferencesAtom);
    const overrides = prefs.soundOverrides ?? DEFAULT_PREFERENCES.soundOverrides;
    const legacy = prefs.notificationMentionSoundPack;
    return legacy && !overrides.mention ? { ...overrides, mention: legacy } : overrides;
  },
  (_get, set, value: Preferences['soundOverrides']) =>
    set(preferencesAtom, (prev) => ({
      ...prev,
      soundOverrides: value,
      notificationMentionSoundPack: '',
    }))
);

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
export const voiceSoundsAtom = preferenceFieldAtom('voiceSounds');

const rawStringStorage = {
  getItem: (key: string, init: string) => localStorage.getItem(key) ?? init,
  setItem: (key: string, value: string) => localStorage.setItem(key, value),
  removeItem: (key: string) => localStorage.removeItem(key),
};

export const languageAtom = atomWithStorage<string>(STORAGE_KEY_LANGUAGE, 'en', rawStringStorage);

export const developerModeAtom = atomWithStorage<boolean>(STORAGE_KEY_DEVELOPER_MODE, false);

export const micMutedAtom = atomWithStorage<boolean>(STORAGE_KEY_MIC_MUTED, false);

export const deafenedAtom = atomWithStorage<boolean>(STORAGE_KEY_DEAFENED, false);
