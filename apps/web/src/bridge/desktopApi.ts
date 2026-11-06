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
  showNotification: ({ title, body, icon, roomUrl }) =>
    invoke<boolean>('show_notification', { title, body, icon, roomUrl }),
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
  setPushToTalkKey: (code) => invoke('push_to_talk_set_key', { code }),
  onPushToTalk: (listener) => onDesktopEvent<boolean>('push-to-talk', listener),
  getPushToTalkPermission: () => invoke<boolean>('push_to_talk_permission', { prompt: false }),
  requestPushToTalkPermission: () => invoke<boolean>('push_to_talk_permission', { prompt: true }),
  onUpdateDownloaded(listener) {
    onDesktopEvent('update-downloaded', listener);
    void invoke<boolean>('update_ready').then((ready) => ready && listener());
  },
  installUpdate() {
    void invoke('install_update');
  },
  getDesktopSources,
  onOpenDesktopPicker,
  selectDesktopSource,
  screenShareAudioSupported,
  startScreenShare,
};
