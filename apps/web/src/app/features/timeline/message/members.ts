import { skipToken, useQuery } from '@tanstack/react-query';
import type { Member } from '@mudrix/core';
import { queryKeys } from '@/app/data';

const byIdCache = new WeakMap<Member[], Map<string, Member>>();
const EMPTY = new Map<string, Member>();

export function useLoadedMembers(roomId: string | null | undefined): ReadonlyMap<string, Member> {
  const { data } = useQuery<Member[]>({
    queryKey: queryKeys.members(roomId ?? ''),
    queryFn: skipToken,
    // Cache-only: useMembers owns the fetch. Without this, React Query tries to run the skipToken
    // query for the first message rendered in a room and logs a configuration error.
    enabled: false,
  });
  if (!data) return EMPTY;
  let byId = byIdCache.get(data);
  if (!byId) {
    byId = new Map(data.map((m) => [m.userId, m]));
    byIdCache.set(data, byId);
  }
  return byId;
}
