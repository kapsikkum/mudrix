import { useCallback, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { refreshRoomSettings, useClient, useRoomSettings } from '@/app/data';
import { useCanSendState } from '@/app/hooks/useCanSendState';

/**
 * The addresses of a room or space: the main one, the others (published ones and the ones on the
 * server's directory, without the main one), and the three changes that keep the alias directory
 * and the room's `m.room.canonical_alias` in step. Failures are thrown for the caller to show.
 */
export function useRoomAliases(roomId: string) {
  const client = useClient();
  const queryClient = useQueryClient();
  const { data: settings } = useRoomSettings(roomId);
  const canEdit = useCanSendState(roomId)('m.room.canonical_alias');

  const canonicalAlias: string | null = settings?.canonicalAlias || null;
  const altAliases = settings?.altAliases;
  const localAliases = settings?.localAliases;
  const aliases = useMemo(
    () =>
      [...new Set([...(altAliases ?? []), ...(localAliases ?? [])])].filter(
        (a) => a !== canonicalAlias
      ),
    [altAliases, localAliases, canonicalAlias]
  );

  const refresh = useCallback(
    () => refreshRoomSettings(queryClient, roomId),
    [queryClient, roomId]
  );

  const onAdd = useCallback(
    async (alias: string) => {
      await client.addRoomAlias(roomId, alias);
      if (canEdit && !(altAliases ?? []).includes(alias) && canonicalAlias !== alias) {
        await client.setCanonicalAlias(roomId, canonicalAlias, [...(altAliases ?? []), alias]);
      }
      void refresh();
    },
    [client, roomId, canEdit, altAliases, canonicalAlias, refresh]
  );

  const onRemove = useCallback(
    async (alias: string) => {
      await client.removeRoomAlias(alias);
      if (canEdit && (canonicalAlias === alias || (altAliases ?? []).includes(alias))) {
        await client.setCanonicalAlias(
          roomId,
          canonicalAlias === alias ? null : canonicalAlias,
          (altAliases ?? []).filter((a) => a !== alias)
        );
      }
      void refresh();
    },
    [client, roomId, canEdit, altAliases, canonicalAlias, refresh]
  );

  const onSetCanonical = useCallback(
    async (alias: string) => {
      const newAlt = [
        ...new Set([
          ...(canonicalAlias && canonicalAlias !== alias ? [canonicalAlias] : []),
          ...(altAliases ?? []).filter((a) => a !== alias),
        ]),
      ];
      await client.setCanonicalAlias(roomId, alias, newAlt);
      void refresh();
    },
    [client, roomId, altAliases, canonicalAlias, refresh]
  );

  return { canonicalAlias, aliases, canEdit, onAdd, onRemove, onSetCanonical };
}

export type RoomAliases = ReturnType<typeof useRoomAliases>;
