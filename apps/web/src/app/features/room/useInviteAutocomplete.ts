import { useState, useCallback, useRef, useEffect } from 'react';
import { useAtomValue } from 'jotai';
import { useQuery } from '@tanstack/react-query';
import type { WizardClient } from '@wizardchat/core';
import { formatUserId } from '@/util/matrix';
import { useAccountData, useAllRooms } from '@/app/data';
import { recentInvitesAtom } from '@/app/store/atoms';

const MAX_RECENT = 20;

export interface RecentUser {
  userId: string;
  displayName: string;
  avatarMxc: string | null;
  timestamp: number;
}

export interface UserSuggestion {
  userId: string;
  displayName: string;
  avatarMxc: string | null;
  source: 'recent' | 'directory';
}

export interface InviteAutocompleteState {
  open: boolean;
  suggestions: UserSuggestion[];
  selectedIndex: number;
  loading: boolean;
}

const CLOSED: InviteAutocompleteState = {
  open: false,
  suggestions: [],
  selectedIndex: 0,
  loading: false,
};

export function useInviteAutocomplete(client: WizardClient) {
  const [state, setState] = useState<InviteAutocompleteState>(CLOSED);
  const recentInvites = useAtomValue(recentInvitesAtom);
  const dmData = useAccountData<Record<string, string[]>>('m.direct');
  const rooms = useAllRooms();
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // On mount, pre-populate with DM partners as "recent users" source
  // (we also pull from localStorage recent-invites)
  const getDmUsers = useCallback((): UserSuggestion[] => {
    if (!dmData) return [];

    const myId = client.userId();
    const roomsById = new Map(rooms.map((r) => [r.id, r]));
    const seen = new Set<string>();
    const results: UserSuggestion[] = [];

    for (const [userId, roomIds] of Object.entries(dmData)) {
      if (userId === myId) continue;
      if (seen.has(userId)) continue;
      seen.add(userId);

      // Find the most recent DM room for this user to get their display name + avatar
      let displayName = formatUserId(userId);
      let avatarMxc: string | null = null;

      for (const roomId of Array.isArray(roomIds) ? roomIds : []) {
        const room = roomsById.get(roomId);
        if (!room || room.dmUserId !== userId) continue;
        displayName = room.name ?? displayName;
        avatarMxc = room.avatarUrl ?? null;
        break;
      }

      results.push({ userId, displayName, avatarMxc, source: 'recent' });
    }

    return results;
  }, [client, dmData, rooms]);

  const buildRecentList = useCallback((): UserSuggestion[] => {
    const stored = recentInvites;
    const dmUsers = getDmUsers();

    const seen = new Set<string>();
    const merged: UserSuggestion[] = [];

    // localStorage recent invites first (most recently invited)
    for (const u of stored) {
      if (seen.has(u.userId)) continue;
      seen.add(u.userId);
      merged.push({
        userId: u.userId,
        displayName: u.displayName,
        avatarMxc: u.avatarMxc,
        source: 'recent',
      });
    }

    // Then DM users
    for (const u of dmUsers) {
      if (seen.has(u.userId)) continue;
      seen.add(u.userId);
      merged.push(u);
    }

    return merged;
  }, [getDmUsers, recentInvites]);

  const directoryQuery = useQuery({
    queryKey: ['user-directory', debouncedQuery],
    queryFn: async ({ signal }) => {
      const result = await client.searchUsers(debouncedQuery, 5);
      if (signal.aborted) return [];
      const myId = client.userId();
      return result
        .filter((r) => r.userId !== myId)
        .map((r) => ({
          userId: r.userId,
          displayName: r.displayName ?? formatUserId(r.userId),
          avatarMxc: r.avatarUrl ?? null,
          source: 'directory' as const,
        }));
    },
    enabled: !!debouncedQuery,
    staleTime: 60_000,
    gcTime: 300_000,
  });

  // Merge directory results with recent matches when directory query resolves
  useEffect(() => {
    if (!debouncedQuery || !directoryQuery.data) return;

    const q = debouncedQuery.toLowerCase();
    const recentMatches = buildRecentList().filter(
      (u) => u.displayName.toLowerCase().includes(q) || u.userId.toLowerCase().includes(q)
    );

    const recentIds = new Set(recentMatches.map((u) => u.userId));
    const dedupedDirectory = directoryQuery.data.filter((u) => !recentIds.has(u.userId));

    const merged = [...recentMatches, ...dedupedDirectory];

    setState({
      open: merged.length > 0,
      suggestions: merged,
      selectedIndex: 0,
      loading: false,
    });
  }, [directoryQuery.data, debouncedQuery, buildRecentList]);

  // Sync loading state from React Query (handles fetch failure too)
  useEffect(() => {
    if (!debouncedQuery) return;
    if (!directoryQuery.isLoading) {
      setState((prev) => ({ ...prev, loading: false }));
    }
  }, [directoryQuery.isLoading, debouncedQuery]);

  const open = useCallback(() => {
    const recent = buildRecentList().slice(0, MAX_RECENT);
    setState({
      open: recent.length > 0,
      suggestions: recent,
      selectedIndex: 0,
      loading: false,
    });
  }, [buildRecentList]);

  const close = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setDebouncedQuery('');
    setState(CLOSED);
  }, []);

  const onInput = useCallback(
    (query: string) => {
      // Cancel pending debounce and any in-flight RQ query
      if (debounceRef.current) clearTimeout(debounceRef.current);
      setDebouncedQuery('');

      const q = query.trim().toLowerCase();

      if (!q) {
        // Empty input shows recent users
        const recent = buildRecentList().slice(0, MAX_RECENT);
        setState({
          open: recent.length > 0,
          suggestions: recent,
          selectedIndex: 0,
          loading: false,
        });
        return;
      }

      // Filter recent users immediately (instant feedback)
      const recentMatches = buildRecentList().filter(
        (u) => u.displayName.toLowerCase().includes(q) || u.userId.toLowerCase().includes(q)
      );

      // Show filtered recent results immediately, mark loading for directory
      setState({
        open: true,
        suggestions: recentMatches,
        selectedIndex: 0,
        loading: true,
      });

      // Debounce directory search 300ms
      debounceRef.current = setTimeout(() => {
        setDebouncedQuery(q);
      }, 300);
    },
    [buildRecentList]
  );

  const onArrow = useCallback(
    (direction: 'up' | 'down'): boolean => {
      if (!state.open || state.suggestions.length === 0) return false;
      setState((prev) => ({
        ...prev,
        selectedIndex:
          direction === 'down'
            ? Math.min(prev.selectedIndex + 1, prev.suggestions.length - 1)
            : Math.max(prev.selectedIndex - 1, 0),
      }));
      return true;
    },
    [state.open, state.suggestions.length]
  );

  const confirm = useCallback((): UserSuggestion | null => {
    if (!state.open || state.suggestions.length === 0) return null;
    return state.suggestions[state.selectedIndex] ?? null;
  }, [state]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  return { state, open, close, onInput, onArrow, confirm };
}
