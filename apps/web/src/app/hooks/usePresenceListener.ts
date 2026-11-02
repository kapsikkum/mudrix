import { useEffect, useMemo } from 'react';
import { useAtomValue, useSetAtom } from 'jotai';
import type { PresenceInfo, WizardClient } from '@wizardchat/core';
import {
  currentRoomIdAtom,
  presenceMapAtom,
  presenceSupportAtom,
  statusMsgMapAtom,
} from '@/app/store/atoms';
import type { PresenceState } from '@/app/store/atoms';
import { useMembers } from '@/app/data';
import { useDms } from './useDms';
import { useSyncReady } from './useSync';

const VALID_STATES: ReadonlySet<string> = new Set(['online', 'offline', 'unavailable']);
const POLL_INTERVAL_MS = 60 * 1000;
const MAX_WATCHED = 100;

function normalizePresence(raw: string | undefined): PresenceState {
  if (raw && VALID_STATES.has(raw)) return raw as PresenceState;
  return 'offline';
}

export function usePresenceListener(client: WizardClient | null | undefined): void {
  const setPresenceMap = useSetAtom(presenceMapAtom);
  const setStatusMap = useSetAtom(statusMsgMapAtom);
  const setSupport = useSetAtom(presenceSupportAtom);
  const syncReady = useSyncReady();
  const currentRoomId = useAtomValue(currentRoomIdAtom);
  const { data: members } = useMembers(currentRoomId);
  const dms = useDms();

  useEffect(() => {
    if (!client || !syncReady) return;
    let cancelled = false;
    client
      .presenceSupported()
      .then((supported) => {
        if (!cancelled) setSupport(supported ? 'supported' : 'unsupported');
      })
      .catch(() => {
        if (!cancelled) setSupport('unsupported');
      });
    return () => {
      cancelled = true;
    };
  }, [client, syncReady, setSupport]);

  const ownId = client?.userId() ?? null;
  const watchedKey = useMemo(() => {
    const ids = new Set<string>();
    for (const dm of dms) if (dm.partnerId) ids.add(dm.partnerId);
    for (const member of members ?? []) ids.add(member.userId);
    if (ownId) ids.delete(ownId);
    return Array.from(ids).slice(0, MAX_WATCHED).join('\n');
  }, [dms, members, ownId]);

  useEffect(() => {
    if (!client || !syncReady || !watchedKey) return;
    const userIds = watchedKey.split('\n');
    let cancelled = false;

    const apply = (results: [string, PresenceInfo | null][]) => {
      setPresenceMap((prev) => {
        let next = prev;
        for (const [userId, info] of results) {
          if (!info) continue;
          const presence = normalizePresence(info.state);
          if (next[userId] === presence) continue;
          if (next === prev) next = { ...prev };
          next[userId] = presence;
        }
        return next;
      });
      setStatusMap((prev) => {
        let next = prev;
        for (const [userId, info] of results) {
          if (!info) continue;
          const statusMsg = info.statusMsg ?? '';
          if ((next[userId] ?? '') === statusMsg) continue;
          if (next === prev) next = { ...prev };
          if (statusMsg) next[userId] = statusMsg;
          else delete next[userId];
        }
        return next;
      });
    };

    const poll = async () => {
      const results = await Promise.all(
        userIds.map(async (userId): Promise<[string, PresenceInfo | null]> => {
          try {
            return [userId, await client.presence(userId)];
          } catch {
            return [userId, null];
          }
        })
      );
      if (!cancelled) apply(results);
    };

    void poll();
    const timer = setInterval(() => void poll(), POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [client, syncReady, watchedKey, setPresenceMap, setStatusMap]);
}
