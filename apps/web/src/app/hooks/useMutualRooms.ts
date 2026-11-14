import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { WizardClient as MatrixClient } from '@wizardchat/core';
import { useAllRooms, useAllJoinedSpaces, useSpaceGraph, parentSpacesOf } from '@/app/data';

export interface MutualRoom {
  roomId: string;
  name: string;
  avatarMxc: string | null;
}

export interface MutualRooms {
  rooms: MutualRoom[];
  spaces: MutualRoom[];
}

type MutualSource = 'server' | 'local';

interface MutualRoomIds {
  ids: string[];
  source: MutualSource;
}

async function fetchServerMutualRooms(
  client: MatrixClient,
  userId: string
): Promise<string[] | null> {
  const session = client.session();
  if (!session?.accessToken || !session?.homeserverUrl) return null;

  const base = session.homeserverUrl.replace(/\/+$/, '');
  for (const path of [
    `/_matrix/client/unstable/uk.half-shot.msc2666/user/mutual_rooms?user_id=${encodeURIComponent(userId)}`,
    `/_matrix/client/v3/user/mutual_rooms?user_id=${encodeURIComponent(userId)}`,
  ]) {
    try {
      const res = await fetch(`${base}${path}`, {
        headers: { Authorization: `Bearer ${session.accessToken}` },
      });
      if (res.ok) {
        const data = (await res.json()) as { joined?: unknown };
        if (Array.isArray(data.joined)) {
          return data.joined.filter((id: unknown): id is string => typeof id === 'string');
        }
      }
    } catch {
      // try next
    }
  }
  return null;
}

export function useMutualRooms(
  client: MatrixClient | null | undefined,
  userId: string | null | undefined,
  enabled = true
) {
  const allRooms = useAllRooms();
  const allSpaces = useAllJoinedSpaces();
  const spaceGraph = useSpaceGraph();

  const { data, isLoading } = useQuery<MutualRoomIds>({
    queryKey: ['mutual-rooms', client?.userId(), userId],
    queryFn: async () => {
      if (!client || !userId) return { ids: [], source: 'local' };
      const server = await fetchServerMutualRooms(client, userId);
      if (server) return { ids: server, source: 'server' };
      return { ids: [], source: 'local' };
    },
    enabled: enabled && !!client && !!userId,
    staleTime: 5 * 60_000,
  });

  const result = useMemo<MutualRooms>(() => {
    const rooms: MutualRoom[] = [];
    const spaces: MutualRoom[] = [];
    if (!client || !data) return { rooms, spaces };

    const seen = new Set<string>();
    const roomsMap = new Map(allRooms.map((r) => [r.id, r]));
    const spacesMap = new Map(allSpaces.map((s) => [s.id, s]));

    for (const id of data.ids) {
      if (seen.has(id)) continue;
      seen.add(id);

      const space = spacesMap.get(id);
      if (space) {
        if (parentSpacesOf(spaceGraph, id).length === 0) {
          spaces.push({
            roomId: id,
            name: space.name || id,
            avatarMxc: space.avatarUrl ?? null,
          });
        }
        continue;
      }

      const room = roomsMap.get(id);
      if (room && !room.isDirect && !room.isTombstoned) {
        rooms.push({
          roomId: id,
          name: room.name || id,
          avatarMxc: room.avatarUrl ?? null,
        });
      }
    }

    const byName = (a: MutualRoom, b: MutualRoom) => a.name.localeCompare(b.name);
    return { rooms: rooms.sort(byName), spaces: spaces.sort(byName) };
  }, [client, data, allRooms, allSpaces, spaceGraph]);

  return { ...result, source: data?.source ?? null, loading: isLoading };
}
