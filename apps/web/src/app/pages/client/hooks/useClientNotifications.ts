import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAtom, useAtomValue } from 'jotai';
import { useTranslation } from 'react-i18next';
import { currentRoomIdAtom } from '@/app/store/atoms';
import {
  notificationSoundsWhenFocusedAtom,
  notificationBannersAtom,
} from '@/app/store/atoms/settings';
import { useSoundSettings } from '@/app/hooks/useSoundSettings';
import {
  showBrowserNotification,
  notificationAvatar,
  playNotificationSound,
} from '@/app/hooks/useNotifications';
import type { Notification as CoreNotification } from '@mudrix/core';
import { getMatrixClientOrNull } from '@/client/initMatrix';
import { useAllRooms } from '@/app/data';
import { formatUserId } from '@/util/matrix';
import { useSyncReady } from '@/app/hooks/useSync';
import { stripBase } from '@/util/publicUrl';
import { isAppFocused, isAppVisible } from '@/bridge/windowActivity';

/** The in-app routes a notification may open; nothing else is accepted from a message. */
const NOTIFICATION_ROUTE_PREFIXES = ['/r/', '/dm/', '/space/'] as const;

/** The router path a service-worker notification may navigate to, or null. */
function notificationRoute(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.origin !== window.location.origin) return null;
  const path = stripBase(url.pathname);
  const known =
    path === '/' ||
    NOTIFICATION_ROUTE_PREFIXES.some(
      (prefix) => path.startsWith(prefix) && path.length > prefix.length
    );
  if (!known) return null;
  return path + url.search + url.hash;
}

export function useClientNotifications() {
  const { t } = useTranslation();
  const client = getMatrixClientOrNull();
  const navigate = useNavigate();
  useSoundSettings();
  const [notificationBanners, setNotificationBanners] = useAtom(notificationBannersAtom);
  const syncReady = useSyncReady();

  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;

  const currentRoomIdRef = useRef<string | null>(null);
  const [currentRoomId] = useAtom(currentRoomIdAtom);
  currentRoomIdRef.current = currentRoomId;

  const soundsWhenFocused = useAtomValue(notificationSoundsWhenFocusedAtom);
  const soundsWhenFocusedRef = useRef(soundsWhenFocused);
  soundsWhenFocusedRef.current = soundsWhenFocused;

  const notificationBannersRef = useRef(notificationBanners);
  notificationBannersRef.current = notificationBanners;

  const tRef = useRef(t);
  tRef.current = t;

  const syncReadyRef = useRef(syncReady);
  syncReadyRef.current = syncReady;

  const notifyForEvent = useRef((notification: CoreNotification) => {
    const mx = getMatrixClientOrNull();
    const myId = mx?.userId();
    if (notification.sender === myId) return;

    // On desktop a window behind another app reads as hidden, so a message in another room (or
    // even in this one while the person is elsewhere) raises a notification like a background tab.
    const isWindowVisible = isAppVisible();
    const isCurrentRoom = notification.roomId === currentRoomIdRef.current;
    if (isWindowVisible && isCurrentRoom) return;

    const senderName = notification.senderName ?? notification.sender;
    const body = notification.spoiler
      ? tRef.current('common.spoilerNotification')
      : notification.body || tRef.current('common.newMessage');

    if (!isWindowVisible && notificationBannersRef.current) {
      const roomUrl = notification.isDirect
        ? `/dm/${encodeURIComponent(notification.roomId)}`
        : `/r/${encodeURIComponent(notification.roomId)}`;
      const title = notification.isDirect
        ? (notification.roomName ?? senderName)
        : `${senderName} in ${notification.roomName ?? notification.roomId}`;
      // The desktop toast shows the sender's avatar where the web banner shows the logo.
      const avatar =
        mx && window.desktopAPI?.showNotification
          ? notificationAvatar(mx, notification.roomId, notification.sender)
          : Promise.resolve(null);
      void avatar.then((png) =>
        showBrowserNotification(title, body, roomUrl, undefined, undefined, png ?? undefined)
      );
    }
    // The window being looked at is quiet unless the person asked for sounds there too.
    const isWindowActive = isWindowVisible && isAppFocused();
    if (!isWindowActive || soundsWhenFocusedRef.current) {
      playNotificationSound(notification.isDirect || notification.highlight);
    }
  });

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    const handler = (event: MessageEvent) => {
      // Only the service worker controlling this page may ask for a navigation: any window,
      // frame or extension can post the same message otherwise. With no controller there is
      // no trusted sender, and a null source (a MessagePort) must not match a missing one.
      const controller = navigator.serviceWorker.controller;
      if (!controller || event.source !== controller) return;
      if (event.data?.type !== 'navigateTo' || typeof event.data.url !== 'string') return;
      const path = notificationRoute(event.data.url);
      if (path) navigateRef.current(path);
    };
    navigator.serviceWorker.addEventListener('message', handler);
    return () => navigator.serviceWorker.removeEventListener('message', handler);
  }, []);

  useEffect(() => {
    const onOpenRoom = (url: string) => navigateRef.current(url);
    window.desktopAPI?.onOpenRoom?.(onOpenRoom);
    window.desktopAPI
      ?.getPendingRoom?.()
      .then((url) => {
        if (url) navigateRef.current(url);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    // The desktop shell raises its own notifications; the webview's permission is not theirs
    if (window.desktopAPI?.showNotification || !('permissions' in navigator)) return;
    navigator.permissions.query({ name: 'notifications' }).then((status) => {
      const handler = () => {
        if (status.state !== 'granted') {
          setNotificationBanners(false);
        }
      };
      status.addEventListener('change', handler);
      return () => status.removeEventListener('change', handler);
    });
  }, [setNotificationBanners]);

  useEffect(() => {
    if (!client) return;
    const subscription = client.watchNotifications((notification) => {
      if (!syncReadyRef.current) return;
      notifyForEvent.current(notification);
    });
    return () => subscription.cancel();
  }, [client]);

  const rooms = useAllRooms();
  const knownInvitesRef = useRef<Set<string> | null>(null);
  useEffect(() => {
    const invites = new Set(rooms.filter((r) => r.isInvite).map((r) => r.id));
    const known = knownInvitesRef.current;
    if (!syncReady) return;
    knownInvitesRef.current = invites;
    if (!client || !known) return;
    for (const roomId of invites) {
      if (known.has(roomId)) continue;
      void client
        .inviteInfo(roomId)
        .catch(() => null)
        .then((info) => {
          const inviterName =
            info?.inviterName ??
            (info?.inviterId ? formatUserId(info.inviterId) : null) ??
            t('invite.unknownInviter');

          const msg = t('invite.receivedInviteSimple', { user: inviterName });

          if (!isAppVisible() && notificationBannersRef.current) {
            showBrowserNotification(t('invite.newInvite'), msg);
          }
          playNotificationSound(true);
        });
    }
  }, [client, rooms, syncReady, t]);
}
