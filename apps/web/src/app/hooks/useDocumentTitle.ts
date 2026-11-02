import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useMember, useProfile, useRoom, useRoomDetails } from '@/app/data';
import { formatUserId } from '@/util/matrix';

const APP_NAME = 'WizardChat';

export function useDocumentTitle(): void {
  const location = useLocation();

  const path = location.pathname;
  const roomMatch = path.match(/^\/(?:r|dm)\/(.+)/);
  const spaceMatch = path.match(/^\/space\/(.+)/);
  const roomId = roomMatch ? decodeURIComponent(roomMatch[1]) : null;
  const spaceId = spaceMatch ? decodeURIComponent(spaceMatch[1]) : null;

  const room = useRoom(roomId);
  const space = useRoomDetails(spaceId);
  const partnerId = room && (room.isDirect || path.startsWith('/dm/')) ? room.dmUserId : null;
  const partner = useMember(partnerId ? roomId : null, partnerId);
  const { data: partnerProfile } = useProfile(partnerId && !partner ? partnerId : null);

  let context: string | null = null;
  if (roomId) {
    if (partnerId) {
      context = partner?.displayName ?? partnerProfile?.displayName ?? formatUserId(partnerId);
    } else {
      context = room ? (room.name ?? roomId) : roomId;
    }
  } else if (spaceId) {
    context = space ? (space.name ?? spaceId) : spaceId;
  }

  useEffect(() => {
    document.title = context ? `${APP_NAME} | ${context}` : APP_NAME;
  }, [context]);

  useEffect(() => {
    return () => {
      document.title = APP_NAME;
    };
  }, []);
}
