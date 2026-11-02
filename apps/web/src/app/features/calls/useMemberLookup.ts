import { useCallback, useMemo } from 'react';
import type { Member } from '@wizardchat/core';
import { useMembers } from '@/app/data';
import { formatUserId } from '@/util/matrix';

export interface MemberInfo {
  name: string;
  avatarUrl: string | null;
  member: Member | null;
}

const LOOKS_LIKE_USER_ID = /@.+:.+/;

/** Member names, with the user ID added when another member shares the name */
export function useMemberLookup(roomId: string | null | undefined): (userId: string) => MemberInfo {
  const { data } = useMembers(roomId);
  const byId = useMemo(() => new Map((data ?? []).map((m) => [m.userId, m])), [data]);
  const nameCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const m of data ?? []) {
      const name = m.displayName?.trim().toLowerCase();
      if (name) counts.set(name, (counts.get(name) ?? 0) + 1);
    }
    return counts;
  }, [data]);
  return useCallback(
    (userId: string) => {
      const member = byId.get(userId) ?? null;
      const displayName = member?.displayName?.trim();
      const ambiguous =
        !!displayName &&
        ((nameCounts.get(displayName.toLowerCase()) ?? 0) > 1 ||
          LOOKS_LIKE_USER_ID.test(displayName));
      return {
        name: displayName
          ? ambiguous
            ? `${displayName} (${userId})`
            : displayName
          : formatUserId(userId),
        avatarUrl: member?.avatarUrl ?? null,
        member,
      };
    },
    [byId, nameCounts]
  );
}
