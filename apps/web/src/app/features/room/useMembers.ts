import { useMemo } from 'react';
import { useAtomValue } from 'jotai';
import type { Member, MemberEntry as CoreMemberEntry, WizardClient } from '@wizardchat/core';
import { presenceMapAtom } from '@/app/store/atoms';
import type { PresenceState } from '@/app/store/atoms';
import { useMembers as useCoreMembers, useMembersIn } from '@/app/data';

export interface MemberEntry {
  userId: string;
  displayName: string;
  avatarMxc: string | null;
  powerLevel: number;
  isPending?: boolean;
  presence?: PresenceState;
}

function fromMember(m: Member, presenceMap: Record<string, PresenceState>): MemberEntry {
  return {
    userId: m.userId,
    displayName: m.displayName ?? m.userId,
    avatarMxc: m.avatarUrl ?? null,
    powerLevel: m.powerLevel ?? Number.POSITIVE_INFINITY,
    presence: presenceMap[m.userId],
  };
}

function fromEntry(
  m: CoreMemberEntry,
  presenceMap: Record<string, PresenceState>,
  isPending?: boolean
): MemberEntry {
  return {
    userId: m.userId,
    displayName: m.displayName ?? m.userId,
    avatarMxc: m.avatarUrl ?? null,
    powerLevel: 0,
    ...(isPending ? { isPending: true } : {}),
    presence: presenceMap[m.userId],
  };
}

export function useMembers(_client: WizardClient | null, roomId: string | null) {
  const presenceMap = useAtomValue(presenceMapAtom);
  const { data, isLoading } = useCoreMembers(roomId);

  const members = useMemo(
    () =>
      (data ?? [])
        .filter((m) => !m.isInvite)
        .map((m) => fromMember(m, presenceMap))
        .sort((a, b) => a.displayName.localeCompare(b.displayName)),
    [data, presenceMap]
  );

  return { members, loading: isLoading };
}

export function useKnockRequests(_client: WizardClient | null, roomId: string | null) {
  const presenceMap = useAtomValue(presenceMapAtom);
  const { data, isLoading } = useMembersIn(roomId, 'knock');
  const knockRequests = useMemo(
    () => (data ?? []).map((m) => fromEntry(m, presenceMap, true)),
    [data, presenceMap]
  );
  return { knockRequests, loading: isLoading };
}

export function useBannedMembers(_client: WizardClient | null, roomId: string | null) {
  const presenceMap = useAtomValue(presenceMapAtom);
  const { data, isLoading } = useMembersIn(roomId, 'ban');
  const bannedMembers = useMemo(
    () =>
      (data ?? [])
        .map((m) => fromEntry(m, presenceMap))
        .sort((a, b) => a.displayName.localeCompare(b.displayName)),
    [data, presenceMap]
  );
  return { bannedMembers, loading: isLoading };
}
