/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly APP_VERSION: string;
  readonly APP_HOME_URL: string;
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

interface ElectronAPI {
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
  onUpdateDownloaded?: (cb: () => void) => void;
  installUpdate?: () => void;
  getPlatform?: () => string;
  setTitleBarTheme?: (background: string, foreground: string) => void;
  onFullscreenChange?: (cb: (fullscreen: boolean) => void) => void;
}

interface Window {
  electronAPI?: ElectronAPI;
  Capacitor?: {
    isNativePlatform?: () => boolean;
    getPlatform?: () => string;
    nativePromise?: <T>(plugin: string, method: string, options?: unknown) => Promise<T>;
    addListener?: <T>(plugin: string, event: string, callback: (data: T) => void) => unknown;
  };
  wizardchatNativeBack?: () => boolean;
}
