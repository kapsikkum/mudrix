/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly APP_VERSION: string;
  readonly APP_HOME_URL: string;
  readonly DESKTOP: boolean;
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

interface DesktopAPI {
  showNotification?: (payload: {
    title: string;
    body: string;
    icon?: string;
    silent?: boolean;
    roomUrl?: string;
  }) => Promise<boolean>;
  onOpenRoom?: (cb: (url: string) => void) => void;
  getPendingRoom?: () => Promise<string | null>;
  getAppVersion?: () => Promise<string>;
  setPushToTalkKey?: (code: string | null) => Promise<'active' | 'no-permission' | 'unsupported'>;
  onPushToTalk?: (cb: (pressed: boolean) => void) => () => void;
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
  /** Saves bytes into the Downloads folder and resolves with the saved path; needs a native command. */
  saveDownload?: (bytes: Uint8Array, filename: string) => Promise<string>;
  getPlatform?: () => string;
  setTitleBarTheme?: (background: string, foreground: string) => void;
  onFullscreenChange?: (cb: (fullscreen: boolean) => void) => void;
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
