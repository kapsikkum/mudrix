import { useCallback, useEffect, useRef } from 'react';
import { useAtomValue, useSetAtom } from 'jotai';
import type { MatrixClient, User } from 'matrix-js-sdk';
import {
  presenceMapAtom,
  presenceOverrideAtom,
  presenceSupportAtom,
  statusMsgMapAtom,
} from '@/app/store/atoms';
import type { PresenceState } from '@/app/store/atoms';
import { useMatrixEvent } from './useMatrixEvent';
import { useSyncReady } from './useSync';

const VALID_STATES: ReadonlySet<string> = new Set(['online', 'offline', 'unavailable']);
const SUPPORT_PROBE_DELAY_MS = 4000;
const LIVE_ACTIVITY_MS = 24 * 60 * 60 * 1000;

function isLivePresence(user: User): boolean {
  if (!user.events.presence || !user.presence || user.presence === 'offline') return false;
  return user.currentlyActive || Date.now() - user.getLastActiveTs() < LIVE_ACTIVITY_MS;
}

function normalizePresence(raw: string | undefined): PresenceState {
  if (raw && VALID_STATES.has(raw)) return raw as PresenceState;
  return 'offline';
}

function seedFromStore(
  client: MatrixClient,
  setPresenceMap: (
    updater: (prev: Record<string, PresenceState>) => Record<string, PresenceState>
  ) => void,
  setStatusMap: (updater: (prev: Record<string, string>) => Record<string, string>) => void
): void {
  const users = client.getUsers();
  if (!users.length) return;

  const ownId = client.getUserId();
  setPresenceMap((prev) => {
    const next: Record<string, PresenceState> = { ...prev };
    let changed = false;
    for (const user of users) {
      if (user.userId === ownId) continue;
      if (!user.presence) continue;
      const presence = normalizePresence(user.presence);
      if (next[user.userId] !== presence) {
        next[user.userId] = presence;
        changed = true;
      }
    }
    return changed ? next : prev;
  });
  setStatusMap((prev) => {
    const next: Record<string, string> = { ...prev };
    let changed = false;
    for (const user of users) {
      if (user.userId === ownId || !user.presenceStatusMsg) continue;
      if (next[user.userId] !== user.presenceStatusMsg) {
        next[user.userId] = user.presenceStatusMsg;
        changed = true;
      }
    }
    return changed ? next : prev;
  });
}

export function usePresenceListener(client: MatrixClient | null | undefined): void {
  const setPresenceMap = useSetAtom(presenceMapAtom);
  const setStatusMap = useSetAtom(statusMsgMapAtom);
  const setSupport = useSetAtom(presenceSupportAtom);
  const appearOffline = useAtomValue(presenceOverrideAtom) === 'offline';
  const syncReady = useSyncReady();
  const seenPresenceRef = useRef(false);

  const markSupported = useCallback(() => {
    if (seenPresenceRef.current) return;
    seenPresenceRef.current = true;
    setSupport('supported');
  }, [setSupport]);

  useEffect(() => {
    if (!client || !syncReady) return;
    seedFromStore(client, setPresenceMap, setStatusMap);
    if (client.getUsers().some(isLivePresence)) markSupported();
  }, [client, syncReady, setPresenceMap, setStatusMap, markSupported]);

  useEffect(() => {
    if (!client || !syncReady) return;
    const userId = client.getUserId();
    if (!userId) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      if (seenPresenceRef.current) return;
      client
        .getPresence(userId)
        .then((res) => {
          if (cancelled || seenPresenceRef.current) return;
          if (res.presence !== 'offline') markSupported();
          else if (!appearOffline) setSupport('unsupported');
        })
        .catch(() => {
          if (!cancelled && !seenPresenceRef.current) setSupport('unsupported');
        });
    }, SUPPORT_PROBE_DELAY_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [client, syncReady, appearOffline, markSupported, setSupport]);

  const handlePresence = useCallback(
    (_event: unknown, user: User) => {
      if (isLivePresence(user)) markSupported();
      if (user.userId === client?.getUserId()) return;
      const presence = normalizePresence(user.presence);
      setPresenceMap((prev) => {
        if (prev[user.userId] === presence) return prev;
        return { ...prev, [user.userId]: presence };
      });
      const statusMsg = user.presenceStatusMsg ?? '';
      setStatusMap((prev) => {
        if ((prev[user.userId] ?? '') === statusMsg) return prev;
        const next = { ...prev };
        if (statusMsg) next[user.userId] = statusMsg;
        else delete next[user.userId];
        return next;
      });
    },
    [client, setPresenceMap, setStatusMap, markSupported]
  );

  useMatrixEvent(client, 'User.presence', handlePresence);
}
