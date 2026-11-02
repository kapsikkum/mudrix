import { useAtomValue } from 'jotai';
import { useRoom, useRoomSettings } from '@/app/data';
import { mediaVisibilityAtom } from '@/app/store/atoms';
import { joinRuleToAccess } from '@/util/matrix';

export function useMediaCoveredByPreference(roomId: string | null | undefined): boolean {
  const mediaVisibility = useAtomValue(mediaVisibilityAtom);
  const room = useRoom(roomId);
  const needsSettings = mediaVisibility === 'private' && !!room && !room.isDirect;
  const { data: settings } = useRoomSettings(needsSettings ? roomId : null);

  if (mediaVisibility === 'never') return true;
  if (mediaVisibility !== 'private') return false;
  if (!room) return true;
  if (room.isDirect) return false;
  if (!settings || settings.isSpace) return true;
  return joinRuleToAccess(settings.joinRule) === 'public';
}
