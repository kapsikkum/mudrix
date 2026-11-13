import { playNotificationSoundFor } from '@/util/notificationSounds';
import { getThemeLogoAssets } from '@/theme/themeLogos';
import i18n from '@/i18n';
import { isStreamerModeActive } from '@/util/streamerMode';
import { fetchMediaBlobUrl } from '@/app/components/Avatar';
import type { WizardClient } from '@wizardchat/core';

export type NotifLevel = 'default' | 'all' | 'mentions' | 'mute';

export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (!('Notification' in window)) return 'denied';
  if (Notification.permission === 'granted' || Notification.permission === 'denied') {
    return Notification.permission;
  }
  try {
    return await Notification.requestPermission();
  } catch {
    return 'denied';
  }
}

/** Plays the chosen message sound, or the mention one for a mention, DM or invite (`priority`). */
export function playNotificationSound(priority = false): void {
  playNotificationSoundFor(priority);
}

let swRegistrationPromise: Promise<ServiceWorkerRegistration | null> | null = null;

export function registerNotificationServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (swRegistrationPromise) return swRegistrationPromise;
  if (!('serviceWorker' in navigator)) {
    swRegistrationPromise = Promise.resolve(null);
    return swRegistrationPromise;
  }
  swRegistrationPromise = (async () => {
    try {
      const reg = await navigator.serviceWorker.register('/sw.js');
      await navigator.serviceWorker.ready;

      await reg.update();

      if (reg.waiting) {
        reg.waiting.postMessage({ type: 'SKIP_WAITING' });
      }

      reg.addEventListener('updatefound', () => {
        const newWorker = reg.installing;
        if (!newWorker) return;
        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            newWorker.postMessage({ type: 'SKIP_WAITING' });
          }
        });
      });

      return reg;
    } catch (err) {
      console.warn('[useNotifications] service worker registration failed', err);
      return null;
    }
  })();
  return swRegistrationPromise;
}

const taggedNotifications = new Map<string, Notification>();

const NOTIFICATION_AVATAR_PX = 96;

/**
 * The sender's avatar as PNG bytes: the desktop toast shows it in place of the app icon, and can
 * only take a local image. Null when they have no avatar or it doesn't load in time.
 */
export async function notificationAvatar(
  client: WizardClient,
  roomId: string,
  senderId: string
): Promise<Uint8Array | null> {
  try {
    const px = NOTIFICATION_AVATAR_PX;
    const member = (await client.members(roomId)).find((m) => m.userId === senderId);
    const src = await fetchMediaBlobUrl(member?.avatarUrl ?? '', client, 0, px, px, 'crop');
    if (!src) return null;
    const img = new Image();
    img.src = src;
    await Promise.race([
      img.decode(),
      new Promise((_, reject) => {
        window.setTimeout(() => reject(new Error('timeout')), 3000);
      }),
    ]);
    const canvas = document.createElement('canvas');
    canvas.width = px;
    canvas.height = px;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    // Cover-crop to a square, the way avatars are shown.
    const side = Math.min(img.naturalWidth, img.naturalHeight);
    ctx.drawImage(
      img,
      (img.naturalWidth - side) / 2,
      (img.naturalHeight - side) / 2,
      side,
      side,
      0,
      0,
      px,
      px
    );
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    return blob ? new Uint8Array(await blob.arrayBuffer()) : null;
  } catch {
    return null;
  }
}

export async function showBrowserNotification(
  title: string,
  body: string,
  roomUrl?: string,
  icon = getThemeLogoAssets().notification,
  tag?: string,
  /** The sender's avatar as PNG bytes, for the desktop toast's own icon. */
  avatar?: Uint8Array
): Promise<void> {
  // Streamer mode: the banner says who, not what.
  if (isStreamerModeActive()) body = i18n.t('settings.privacy.streamer.notificationBody');
  if (window.desktopAPI?.showNotification) {
    try {
      const shown = await window.desktopAPI.showNotification({
        title,
        body,
        icon,
        avatar,
        silent: true,
        roomUrl,
      });
      if (shown !== false) return;
    } catch (err) {
      console.warn('[useNotifications] desktop showNotification failed, falling back', err);
    }
  }

  if (!('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;

  const data = roomUrl ? { url: roomUrl } : undefined;

  const reg = await registerNotificationServiceWorker();
  if (reg) {
    try {
      await reg.showNotification(title, { body, icon, silent: true, data, tag });
      return;
    } catch (err) {
      console.warn('[useNotifications] SW showNotification failed, falling back', err);
    }
  }

  try {
    const n = new Notification(title, { body, icon, silent: true, data, tag });
    if (tag) taggedNotifications.set(tag, n);
    n.onclick = roomUrl
      ? () => {
          window.focus();
          window.location.href = roomUrl;
        }
      : null;
    n.onerror = () => {};
  } catch {
    // ignore
  }
}

/** Closes a notification shown with `tag`; desktop notifications can't be withdrawn */
export async function closeBrowserNotification(tag: string): Promise<void> {
  taggedNotifications.get(tag)?.close();
  taggedNotifications.delete(tag);
  if (!('serviceWorker' in navigator) || !swRegistrationPromise) return;
  const reg = await swRegistrationPromise;
  const shown = await reg?.getNotifications({ tag }).catch(() => []);
  for (const notification of shown ?? []) notification.close();
}
