/** `window.desktopAPI` on Tauri: what the desktop app adds to the web UI */
import { getVersion } from '@tauri-apps/api/app';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWindow, UserAttentionType } from '@tauri-apps/api/window';
import {
  getDesktopSources,
  onOpenDesktopPicker,
  screenShareAudioSupported,
  selectDesktopSource,
  startScreenShare,
} from './screenCapture';

export function onDesktopEvent<T>(event: string, listener: (payload: T) => void): () => void {
  const unlisten = listen<T>(event, (e) => listener(e.payload));
  return () => void unlisten.then((stop) => stop());
}

function platform(): string {
  if (/Mac/.test(navigator.userAgent)) return 'darwin';
  if (/Win/.test(navigator.userAgent)) return 'win32';
  return 'linux';
}

const takePendingRoom = () => invoke<string | null>('take_pending_room');

export const desktopApi: DesktopAPI = {
  showNotification: ({ title, body, icon, avatar, roomUrl }) =>
    invoke<boolean>('show_notification', {
      title,
      body,
      icon,
      avatar: avatar && Array.from(avatar),
      roomUrl,
    }),
  // A clicked notification leaves its room with the app until the UI takes it
  onOpenRoom(listener) {
    onDesktopEvent('open-room', () => {
      void takePendingRoom().then((url) => url && listener(url));
    });
  },
  getPendingRoom: takePendingRoom,
  requestAttention(on) {
    void getCurrentWindow()
      .requestUserAttention(on ? UserAttentionType.Critical : null)
      .catch(() => {});
  },
  getAppVersion: getVersion,
  getPlatform: platform,
  setTitleBarTheme(background) {
    void invoke('set_background_color', { color: background }).catch(() => {});
  },
  // Raw body (the bytes) with the name in a header; the shell sanitises it and returns the path
  saveDownload: (bytes, filename) =>
    invoke<string>('save_download', bytes, {
      headers: { 'x-filename': encodeURIComponent(filename) },
    }),
  pickKeyFileToSave: (defaultName) =>
    invoke<string | null>('pick_key_file_to_save', { defaultName }),
  pickKeyFileToOpen: () => invoke<string | null>('pick_key_file_to_open'),
  getSettings: () => invoke<DesktopSettings>('get_desktop_settings'),
  setSettings: (patch) => invoke<DesktopSettings>('set_desktop_settings', { patch }),
  onSettingsChange: (listener) =>
    onDesktopEvent<DesktopSettings>('desktop://settings-changed', listener),
  setUnreadCount(total, highlight) {
    void invoke('set_unread_count', { total, highlight }).catch(() => {});
  },
  // The window and taskbar icon follow the theme; null restores the bundled icons
  async setAppIcon(logoUrl) {
    try {
      if (!logoUrl) {
        await invoke('set_app_icon', { png: null });
        return;
      }
      const image = new Image();
      image.src = logoUrl;
      await image.decode();
      const size = 256;
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const context = canvas.getContext('2d');
      if (!context) return;
      context.drawImage(image, 0, 0, size, size);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
      if (!blob) return;
      await invoke('set_app_icon', { png: Array.from(new Uint8Array(await blob.arrayBuffer())) });
    } catch (error) {
      console.warn('[desktop] set_app_icon failed', error);
    }
  },
  onFullscreenChange: (listener) => onDesktopEvent<boolean>('fullscreen-changed', listener),
  // The call's window of its own is opened by the web app with window.open; the shell answers it
  // and says when the window is gone, however it went
  hideCallPopout() {
    void invoke('hide_call_popout').catch(() => {});
  },
  onCallPopoutClosed: (listener) => onDesktopEvent('call-popout-closed', () => listener()),
  setGlobalKey: (id, code) => invoke('global_key_set', { id, code }),
  onGlobalKey: (listener) =>
    onDesktopEvent<{ id: string; down: boolean }>('global-key', ({ id, down }) =>
      listener(id, down)
    ),
  setKeepAwake: (on) => invoke('keep_awake', { on }),
  getPushToTalkPermission: () => invoke<boolean>('global_keys_permission', { prompt: false }),
  requestPushToTalkPermission: () => invoke<boolean>('global_keys_permission', { prompt: true }),
  onUpdateDownloaded(listener) {
    onDesktopEvent('update-downloaded', listener);
    void invoke<boolean>('update_ready').then((ready) => ready && listener());
  },
  onUpdateProgress: (listener) =>
    onDesktopEvent<{ downloaded: number; total: number | null; percent: number | null }>(
      'update-progress',
      listener
    ),
  installUpdate() {
    void invoke('install_update');
  },
  checkForUpdate: (includePrereleases) => invoke('check_for_update', { includePrereleases }),
  getDesktopSources,
  onOpenDesktopPicker,
  selectDesktopSource,
  screenShareAudioSupported,
  startScreenShare,
};
