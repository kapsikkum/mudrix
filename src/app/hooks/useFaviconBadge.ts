import { useEffect, useCallback } from 'react';
import { useAtomValue } from 'jotai';
import { getMatrixClientOrNull } from '@/client/initMatrix';
import { useMatrixEvent } from '@/app/hooks/useMatrixEvent';
import { useThrottle } from '@/app/hooks/useThrottle';
import { themeAtom, themedAppIconAtom } from '@/app/store/atoms';
import { resolveLogoAssets } from '@/theme/themeLogos';

import { roomState } from '@/util/matrix';
import { getRoomUnreadCount } from '@/util/mentions';

function setFavicon(href: string) {
  for (const link of document.querySelectorAll<HTMLLinkElement>('link[rel="icon"]')) {
    if (link.getAttribute('href') !== href) link.setAttribute('href', href);
  }
  for (const link of document.querySelectorAll<HTMLLinkElement>('link[rel="apple-touch-icon"]')) {
    if (link.getAttribute('href') !== href) link.setAttribute('href', href);
  }
}

export function useFaviconBadge() {
  const client = getMatrixClientOrNull();
  const theme = useAtomValue(themeAtom);
  const themedAppIcon = useAtomValue(themedAppIconAtom);

  const checkUnread = useCallback(() => {
    const assets = resolveLogoAssets(theme, themedAppIcon);
    if (!client) {
      setFavicon(assets.logo);
      return;
    }
    const hasUnread = client.getRooms().some((room) => {
      if (room.getMyMembership() !== 'join') return false;
      if (roomState(room).getStateEvents('m.room.tombstone', '')) return false;
      return getRoomUnreadCount(client, room) > 0;
    });
    setFavicon(hasUnread ? assets.notification : assets.logo);
  }, [client, theme, themedAppIcon]);

  useEffect(() => {
    checkUnread();
  }, [checkUnread]);

  const throttledCheck = useThrottle(checkUnread, 300);
  useMatrixEvent(client, 'Room.UnreadNotifications', throttledCheck);
  useMatrixEvent(client, 'Room.timeline', throttledCheck);
  useMatrixEvent(client, 'Room.receipt', throttledCheck);
  useMatrixEvent(client, 'sync', throttledCheck);
}
