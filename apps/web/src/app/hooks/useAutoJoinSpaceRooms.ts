import { useEffect, useMemo, useRef } from 'react';
import type { SpaceChild, WizardClient } from '@wizardchat/core';
import { useAllJoinedSpaces, useSpaceGraph, useSyncReady } from '@/app/data';
import { explicitAutoJoinOf } from '@/app/features/space/spaceAutoJoin';
import { useMudrixRoomStates } from '@/app/features/space/mudrixRoomState';
import { rootSpaceOf, styleOf } from '@/app/features/space/spaceListStyle';
import { accountStorageKey } from '@/const/accountStorage';

const DONE_KEY = 'wz_autojoin_done';
/** Rooms tried per pass and in parallel: a big space should not hammer the server. */
const MAX_PER_PASS = 300;
const PARALLEL = 3;
const MAX_REMEMBERED = 5000;
/** The server may not count us as a member for a moment after we joined the space. */
const RETRY_DELAY_MS = 4000;
/** A room the server keeps refusing is given up on after this many passes. */
const MAX_REFUSALS = 3;
/** Later passes after a rate limit or an outage: 30 s, 1 min, 2 min ... up to 15 min. */
const LATER_BASE_MS = 30_000;
const LATER_MAX_MS = 15 * 60_000;
const MAX_LATER_PASSES = 6;
/** Rooms are looked for again this often, for rooms added to a space while the app is open. */
const REVISIT_MS = 5 * 60_000;

/** Refusals about the room itself, which trying again will not change. */
const PERMANENT = new Set([
  'M_FORBIDDEN',
  'M_NOT_FOUND',
  'M_UNSUPPORTED_ROOM_VERSION',
  'M_INCOMPATIBLE_ROOM_VERSION',
  'M_BAD_JSON',
  'M_INVALID_PARAM',
  'M_UNRECOGNIZED',
  'M_BAD_STATE',
  'M_GUEST_ACCESS_FORBIDDEN',
]);

function loadDone(): Set<string> {
  try {
    return new Set(
      JSON.parse(localStorage.getItem(accountStorageKey(DONE_KEY)) ?? '[]') as string[]
    );
  } catch {
    return new Set();
  }
}

function saveDone(done: Set<string>): void {
  try {
    localStorage.setItem(
      accountStorageKey(DONE_KEY),
      JSON.stringify([...done].slice(-MAX_REMEMBERED))
    );
  } catch {
    // remembering is best effort; the worst case is one more try at a room
  }
}

/**
 * Private (invite only) rooms are left alone. The server leaves the join rule out for some rooms,
 * so a missing one is tried: the join itself says no if it is not allowed.
 */
function joinable(child: SpaceChild): boolean {
  const rule = child.joinRule;
  return !rule || rule === 'public' || rule === 'restricted' || rule === 'knock_restricted';
}

/** 'done' joined, 'refused' the server said no for this room, 'later' limited or unreachable. */
type Outcome = 'done' | 'refused' | 'later';

async function joinOne(client: WizardClient, child: SpaceChild): Promise<Outcome> {
  try {
    await client.join(child.id, child.via.length > 0 ? child.via : null);
    return 'done';
  } catch (err) {
    const errcode = (err as { errcode?: unknown } | null)?.errcode;
    if (errcode === 'M_LIMIT_EXCEEDED') return 'later';
    return typeof errcode === 'string' && PERMANENT.has(errcode) ? 'refused' : 'later';
  }
}

/** One pass over a space: joins what is joinable and not tried before. Returns whether to try again. */
async function passOver(
  client: WizardClient,
  spaceId: string,
  done: Set<string>,
  refusals: Map<string, number>,
  isStopped: () => boolean
): Promise<boolean> {
  let again = false;
  const { children } = await client.spaceHierarchy(spaceId);
  const todo = children
    .filter((c) => !c.joined && !c.invited && !c.knocked && !done.has(c.id) && joinable(c))
    .slice(0, MAX_PER_PASS);
  if (children.length > 0 && todo.length === 0) return false;
  const queue = [...todo];
  await Promise.all(
    Array.from({ length: Math.min(PARALLEL, queue.length) }, async () => {
      for (let next = queue.shift(); next && !isStopped(); next = queue.shift()) {
        const outcome = await joinOne(client, next);
        if (outcome === 'done') {
          done.add(next.id);
        } else if (outcome === 'refused') {
          // Right after joining the space the server may still say no once; ask again a moment later.
          const count = (refusals.get(next.id) ?? 0) + 1;
          refusals.set(next.id, count);
          if (count >= MAX_REFUSALS) done.add(next.id);
          else again = true;
        } else {
          again = true;
        }
      }
    })
  );
  saveDone(done);
  return again;
}

/**
 * Joins people to every room of a space that has "Join new members to every room" on (Modern
 * spaces have it on unless set otherwise). Private rooms stay invite only, and a room someone
 * leaves is not joined again. Runs once the first sync is in, when the rooms of such a space
 * change, and every few minutes.
 */
export function useAutoJoinSpaceRooms(client: WizardClient | null): void {
  const ready = useSyncReady();
  const spaces = useAllJoinedSpaces();
  const graph = useSpaceGraph();
  const spaceIds = useMemo(() => spaces.map((s) => s.id), [spaces]);
  const roots = useMemo(
    () => [...new Set(spaceIds.map((id) => rootSpaceOf(graph, id)))],
    [spaceIds, graph]
  );
  const states = useMudrixRoomStates(ready ? [...new Set([...spaceIds, ...roots])] : []);

  const enabled = useMemo(
    () =>
      spaceIds.filter((id) => {
        const state = states.get(id);
        if (!state) return false;
        return (
          explicitAutoJoinOf(state) ?? styleOf(states.get(rootSpaceOf(graph, id))) === 'modern'
        );
      }),
    [spaceIds, states, graph]
  );
  // What makes a new pass worthwhile: the spaces and the rooms they list
  const signature = enabled
    .map((id) => `${id}:${graph.find((s) => s.spaceId === id)?.children.length ?? 0}`)
    .join('|');
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  useEffect(() => {
    if (!client || !ready || enabledRef.current.length === 0) return;
    let stopped = false;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const done = loadDone();
    const refusals = new Map<string, number>();
    let running = false;

    const run = async (attempt: number) => {
      if (running || stopped) return;
      running = true;
      let again = false;
      for (const spaceId of enabledRef.current) {
        if (stopped) break;
        try {
          if (await passOver(client, spaceId, done, refusals, () => stopped)) again = true;
        } catch {
          again = true;
        }
      }
      running = false;
      if (!again || stopped || attempt >= MAX_LATER_PASSES) return;
      const delay =
        attempt === 0 ? RETRY_DELAY_MS : Math.min(LATER_BASE_MS * 2 ** (attempt - 1), LATER_MAX_MS);
      const timer = setTimeout(() => {
        timers.delete(timer);
        void run(attempt + 1);
      }, delay);
      timers.add(timer);
    };

    void run(0);
    const revisit = setInterval(() => void run(0), REVISIT_MS);
    return () => {
      stopped = true;
      clearInterval(revisit);
      timers.forEach(clearTimeout);
    };
  }, [client, ready, signature]);
}
