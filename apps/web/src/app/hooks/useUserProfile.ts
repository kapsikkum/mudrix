import { useMemo } from 'react';
import {
  useMember,
  useMembers,
  useProfile,
  useRoomSettings,
  useUserId,
  powerLevelOf,
} from '@/app/data';
import { formatUserId } from '@/util/matrix';

export interface UserProfileData {
  displayName: string;
  avatarMxc: string | null;
  powerLevel: number;
  homeserver: string;
  userId: string;
  canModify: boolean;
}

/** A user's name, avatar and role, as a room member when `roomId` is given */
export function useUserProfile(
  userId: string | null,
  roomId?: string | null
): UserProfileData | null {
  const member = useMember(roomId, userId);
  const { data: profile } = useProfile(member ? null : userId);
  const { data: settings } = useRoomSettings(roomId);
  useMembers(roomId);
  const me = useUserId();

  return useMemo(() => {
    if (!userId) return null;
    const ownLevel = powerLevelOf(settings?.powerLevels, me, settings?.creators);
    return {
      displayName: member?.displayName ?? profile?.displayName ?? formatUserId(userId),
      avatarMxc: member?.avatarUrl ?? profile?.avatarUrl ?? null,
      powerLevel:
        member?.powerLevel ?? powerLevelOf(settings?.powerLevels, userId, settings?.creators),
      homeserver: userId.includes(':') ? userId.split(':')[1] : '',
      userId,
      canModify: ownLevel >= 100,
    };
  }, [userId, member, profile, settings, me]);
}
