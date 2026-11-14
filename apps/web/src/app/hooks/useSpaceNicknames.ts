import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { WizardClient } from '@wizardchat/core';
import { useAccountData, useAllRooms, useSpaceGraph, useSyncReady } from '@/app/data';
import { usePrompt } from '@/app/hooks/usePrompt';
import { useToast } from '@/app/hooks/useToast';
import {
  LEGACY_NICKNAMES_TYPE,
  MAX_NICKNAME_LENGTH,
  NICKNAMES_TYPE,
  joinedRoomsOfSpace,
  nicknameTargets,
  parseSpaceNicknames,
  targetsKey,
  withSpaceNickname,
} from '@/util/spaceNicknames';

const SETTLE_MS = 2500;

/** Space id to the nickname chosen for it (account data, current and old name), live. */
export function useSpaceNicknames(): Record<string, string> {
  const current = useAccountData(NICKNAMES_TYPE);
  const legacy = useAccountData(LEGACY_NICKNAMES_TYPE);
  return useMemo(() => parseSpaceNicknames(current, legacy), [current, legacy]);
}

/** The ids of the rooms and spaces the user is in. */
function useJoinedIds(): ReadonlySet<string> {
  const rooms = useAllRooms();
  const key = rooms
    .filter((r) => !r.isInvite)
    .map((r) => r.id)
    .join('|');
  return useMemo(() => new Set(key ? key.split('|') : []), [key]);
}

/**
 * Makes `nickname` (null: the account's own name) the user's name in the given rooms. Rooms that
 * already show it are skipped; resolves to how many were changed.
 */
export async function applyDisplayName(
  client: WizardClient,
  roomIds: readonly string[],
  nickname: string | null,
  accountName: string | null
): Promise<number> {
  const me = client.userId();
  if (!me) return 0;
  const wanted = nickname ?? accountName;
  let changed = 0;
  for (const roomId of roomIds) {
    const profile = await client.roomMemberProfile(roomId, me);
    if (profile.membership !== 'join') continue;
    if (wanted !== null && profile.displayname === wanted) continue;
    await client.setRoomNickname(roomId, nickname);
    changed += 1;
  }
  return changed;
}

/**
 * Keeps your nickname for each space on your profile in all of that space's rooms: when the
 * nickname is set on another device, and for rooms you join in the space later. (A profile rename
 * on this account puts the room names back only when this runs again, at the next start.)
 */
export function useSpaceNicknameSync(client: WizardClient | null): void {
  const syncReady = useSyncReady();
  const nicknames = useSpaceNicknames();
  const graph = useSpaceGraph();
  const joined = useJoinedIds();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const running = useRef(false);
  // What was last written, by room, so a room is not looked at again until its target changes.
  const done = useRef(new Map<string, string>());

  const targets = useMemo(
    () => nicknameTargets(graph, joined, nicknames),
    [graph, joined, nicknames]
  );
  const key = targetsKey(targets);

  const targetsRef = useRef(targets);
  targetsRef.current = targets;

  useEffect(() => {
    if (!client || !syncReady || targetsRef.current.size === 0) return undefined;
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      timer.current = null;
      if (running.current) return;
      running.current = true;
      void (async () => {
        try {
          const accountName = (await client.ownProfile()).displayName;
          for (const [roomId, nickname] of targetsRef.current) {
            if (done.current.get(roomId) === nickname) continue;
            try {
              await applyDisplayName(client, [roomId], nickname, accountName);
              done.current.set(roomId, nickname);
            } catch {
              // try this room again the next time something changes
            }
          }
        } catch {
          // no profile yet: the next change tries again
        } finally {
          running.current = false;
        }
      })();
    }, SETTLE_MS);
    return () => {
      if (timer.current !== null) clearTimeout(timer.current);
    };
  }, [client, syncReady, key]);
}

/** Opens the "Nickname in this space" prompt and applies the answer; empty goes back to your name. */
export function useSpaceNicknamePrompt(client: WizardClient | null) {
  const { t } = useTranslation();
  const toast = useToast();
  const prompt = usePrompt();
  const nicknames = useSpaceNicknames();
  const graph = useSpaceGraph();
  const joined = useJoinedIds();

  return useCallback(
    async (spaceId: string, spaceName: string) => {
      if (!client) return;
      const current = nicknames[spaceId] ?? '';
      const answer = await prompt({
        title: t('room.space.nickname.title', { name: spaceName }),
        message: t('room.space.nickname.message'),
        defaultValue: current,
      });
      if (answer === null) return;
      const nickname = answer.trim().slice(0, MAX_NICKNAME_LENGTH);
      if (nickname === current) return;
      try {
        const next = withSpaceNickname(nicknames, spaceId, nickname || null);
        await client.setAccountData(NICKNAMES_TYPE, next);
        toast.info(t(nickname ? 'room.space.nickname.applying' : 'room.space.nickname.resetting'));
        // Rooms that a sub-space (or another space) has its own nickname for keep that one; the
        // rest take this nickname, or your own name when it was cleared.
        const targets = nicknameTargets(graph, joined, next);
        const accountName = (await client.ownProfile()).displayName;
        for (const roomId of joinedRoomsOfSpace(graph, joined, spaceId)) {
          await applyDisplayName(client, [roomId], targets.get(roomId) ?? null, accountName);
        }
        toast.success(t(nickname ? 'room.space.nickname.done' : 'room.space.nickname.reset'));
      } catch {
        toast.error(t('room.space.nickname.failed'));
      }
    },
    [client, nicknames, graph, joined, prompt, t, toast]
  );
}
