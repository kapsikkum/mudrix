import { useEffect } from 'react';
import { useAtomValue } from 'jotai';
import { useAllRooms } from '@/app/data';
import { effectiveThemeAtom, themedAppIconAtom } from '@/app/store/atoms';
import { resolveLogoAssets } from '@/theme/themeLogos';

import { getRoomUnreadCount, roomHasUnreadMention } from '@/util/mentions';

function setFavicon(href: string) {
  for (const link of document.querySelectorAll<HTMLLinkElement>('link[rel="icon"]')) {
    if (link.getAttribute('href') !== href) link.setAttribute('href', href);
  }
  for (const link of document.querySelectorAll<HTMLLinkElement>('link[rel="apple-touch-icon"]')) {
    if (link.getAttribute('href') !== href) link.setAttribute('href', href);
  }
}

export function useFaviconBadge() {
  const rooms = useAllRooms();
  const theme = useAtomValue(effectiveThemeAtom);
  const themedAppIcon = useAtomValue(themedAppIconAtom);

  const hasUnread = rooms.some(
    (room) => !room.isInvite && !room.isTombstoned && getRoomUnreadCount(room) > 0
  );

  // The desktop shell shows the unread count on its tray icon, taskbar overlay and dock badge
  let total = 0;
  let mentionRooms = 0;
  for (const room of rooms) {
    if (room.isInvite || room.isTombstoned) continue;
    total += getRoomUnreadCount(room);
    if (roomHasUnreadMention(room)) mentionRooms += 1;
  }
  useEffect(() => {
    window.desktopAPI?.setUnreadCount?.(total, mentionRooms);
  }, [total, mentionRooms]);

  useEffect(() => {
    const assets = resolveLogoAssets(theme, themedAppIcon);
    setFavicon(hasUnread ? assets.notification : assets.logo);
  }, [hasUnread, theme, themedAppIcon]);
}
