import { useMemo } from 'react';
import type { WizardClient } from '@wizardchat/core';
import { useDms } from '@/app/hooks/useDms';
import { parentSpacesOf, useAllRooms, useJoinedSpaces, useSpaceGraph } from '@/app/data';
import { formatUserId } from '@/util/matrix';

export interface ActiveVoicePerson {
  userId: string;
  name: string;
  avatarMxc: string | null;
  known: boolean;
}

export interface ActiveVoiceCard {
  roomId: string;
  roomName: string;
  spaceName: string | null;
  people: ActiveVoicePerson[];
  knownCount: number;
  includesMe: boolean;
}

/**
 * Voice channels with people in them right now. `onlyWithKnown` keeps the ones that have someone
 * you have a direct chat with (the Active now panel); without it every live channel is listed.
 */
export function useActiveVoiceCards(
  client: WizardClient | null | undefined,
  options?: { onlyWithKnown?: boolean }
): ActiveVoiceCard[] {
  const dms = useDms();
  const rooms = useAllRooms();
  const spaces = useJoinedSpaces();
  const graph = useSpaceGraph();
  const myId = client?.userId();
  const onlyWithKnown = options?.onlyWithKnown ?? false;

  const knownById = useMemo(() => new Map(dms.map((dm) => [dm.partnerId, dm])), [dms]);

  return useMemo((): ActiveVoiceCard[] => {
    const list: ActiveVoiceCard[] = [];
    for (const room of rooms) {
      if (!room.isVoice || room.isInvite || room.callParticipants.length === 0) continue;
      const roomId = room.id;
      const userIds = [...new Set(room.callParticipants)];
      const people = userIds.map((userId) => {
        const dm = knownById.get(userId);
        return {
          userId,
          name: dm?.partnerName ?? formatUserId(userId),
          avatarMxc: dm?.partnerAvatarMxc ?? null,
          known: userId !== myId && !!dm,
        };
      });
      const knownCount = people.filter((p) => p.known).length;
      if (onlyWithKnown && knownCount === 0) continue;
      people.sort((a, b) => Number(b.known) - Number(a.known));
      const parentId = parentSpacesOf(graph, roomId)[0];
      list.push({
        roomId,
        roomName: room.name ?? roomId,
        spaceName: parentId ? (spaces.find((s) => s.id === parentId)?.name ?? null) : null,
        people,
        knownCount,
        includesMe: !!myId && userIds.includes(myId),
      });
    }
    return list.sort((a, b) => b.knownCount - a.knownCount || b.people.length - a.people.length);
  }, [rooms, knownById, myId, graph, spaces, onlyWithKnown]);
}
