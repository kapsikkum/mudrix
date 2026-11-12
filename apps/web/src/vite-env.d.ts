/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly APP_VERSION: string;
  readonly APP_HOME_URL: string;
  readonly DESKTOP: boolean;
  readonly VITE_GIPHY_API_KEY?: string;
  readonly VITE_KLIPY_API_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

interface DesktopSource {
  id: string;
  name: string;
  display_id: string;
  thumbnail: { dataUrl: string };
  appIcon: string | null;
}

/** Settings the desktop shell keeps itself, because it needs them before the web app has loaded */
interface DesktopSettings {
  /** Closing the window hides it to the tray instead of quitting */
  keepRunningInBackground: boolean;
  launchAtLogin: boolean;
  /** When started at login, stay in the tray */
  startMinimized: boolean;
  /** The tray's "Mute notifications" */
  notificationsMuted: boolean;
}

interface DesktopAPI {
  showNotification?: (payload: {
    title: string;
    body: string;
    icon?: string;
    silent?: boolean;
    roomUrl?: string;
  }) => Promise<boolean>;
  onOpenRoom?: (cb: (url: string) => void) => void;
  /** Flashes the taskbar entry or bounces the dock icon until the window is focused or `false` */
  requestAttention?: (on: boolean) => void;
  getPendingRoom?: () => Promise<string | null>;
  getAppVersion?: () => Promise<string>;
  setGlobalKey?: (
    id: string,
    code: string | null
  ) => Promise<'active' | 'taken' | 'no-permission' | 'unsupported'>;
  onGlobalKey?: (cb: (id: string, down: boolean) => void) => () => void;
  /** Keeps the display on natively, as the webview's Wake Lock API isn't everywhere */
  setKeepAwake?: (on: boolean) => Promise<void>;
  getPushToTalkPermission?: () => Promise<boolean>;
  requestPushToTalkPermission?: () => Promise<boolean>;
  getDesktopSources?: (options: {
    types: string[];
    thumbnailSize?: { width: number; height: number };
  }) => Promise<DesktopSource[]>;
  onOpenDesktopPicker?: (cb: () => void) => () => void;
  selectDesktopSource?: (source: Record<string, unknown> | null) => void;
  /** Whether the in-app picker offers sharing system audio */
  screenShareAudioSupported?: () => Promise<boolean>;
  /** Native capture with the in-app picker; undefined when this platform has none */
  startScreenShare?: () => Promise<
    { video: MediaStreamTrack; audio: MediaStreamTrack | null; stop(): void } | null | undefined
  >;
  onUpdateDownloaded?: (cb: () => void) => void;
  installUpdate?: () => void;
  /** Asks the update feed now (stable, or with pre-releases the `next` channel) */
  checkForUpdate?: (
    includePrereleases: boolean
  ) => Promise<{ status: 'upToDate' | 'ready' } | { status: 'available'; version: string }>;
  /** Saves bytes into the Downloads folder and resolves with the saved path; needs a native command. */
  saveDownload?: (bytes: Uint8Array, filename: string) => Promise<string>;
  getSettings?: () => Promise<DesktopSettings>;
  setSettings?: (patch: Partial<DesktopSettings>) => Promise<DesktopSettings>;
  /** Called when the shell changes a setting itself (the tray's mute switch); returns a stopper */
  onSettingsChange?: (cb: (settings: DesktopSettings) => void) => () => void;
  /** Tray icon and tooltip, taskbar overlay and dock badge: unread messages and rooms with a mention */
  setUnreadCount?: (total: number, highlight: number) => void;
  getPlatform?: () => string;
  setTitleBarTheme?: (background: string, foreground: string) => void;
  onFullscreenChange?: (cb: (fullscreen: boolean) => void) => () => void;
}

interface Window {
  desktopAPI?: DesktopAPI;
  Capacitor?: {
    isNativePlatform?: () => boolean;
    getPlatform?: () => string;
    nativePromise?: <T>(plugin: string, method: string, options?: unknown) => Promise<T>;
    addListener?: <T>(plugin: string, event: string, callback: (data: T) => void) => unknown;
  };
  wizardchatNativeBack?: () => boolean;
}
