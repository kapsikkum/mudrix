import { useEffect, useSyncExternalStore } from 'react';
import type { WizardClient } from '@wizardchat/core';
import { getMatrixClientOrNull } from '@/client/initMatrix';
import { mudrixKey, typeAndLegacy } from '@/util/namespace';
import { forgetVoiceChannelFlags, rememberVoiceChannelFlag } from '@/util/voiceChannelFlags';

/**
 * Mudrix keeps a few things in state events on a space or room (list style, banner, auto-join,
 * roles, voice channel). Sliding sync does not deliver custom state, so the core reads them from
 * the server (`stateEventsOfTypes`, one request for all of them) and this store keeps the answer
 * for a minute, refetches it when the room's state changes, and updates it when this device writes.
 */
export const MUDRIX_ROOM_STATE_TYPES = [
  mudrixKey('space_list_style'),
  mudrixKey('space_banner'),
  mudrixKey('space_auto_join'),
  mudrixKey('space_roles'),
  mudrixKey('space_member_roles'),
  mudrixKey('voice_channel'),
] as const;

const FETCHED_TYPES = MUDRIX_ROOM_STATE_TYPES.flatMap((type) => [...typeAndLegacy(type)]);
const FRESH_MS = 60_000;
const MAX_PARALLEL = 4;

type Entry = [type: string, stateKey: string, content: unknown];

/** What a room holds of the Mudrix state types, current names first, legacy names as a fallback. */
export class MudrixRoomState {
  constructor(private readonly entries: readonly Entry[]) {}

  /** The content under `type` (or its legacy name) and `stateKey`. */
  get(type: string, stateKey = ''): Record<string, unknown> | undefined {
    for (const name of typeAndLegacy(type)) {
      const found = this.entries.find(([t, key]) => t === name && key === stateKey)?.[2];
      if (found && typeof found === 'object' && !Array.isArray(found)) {
        return found as Record<string, unknown>;
      }
    }
    return undefined;
  }

  /** Every state key's content under `type`; a key set under both names counts once, current first. */
  all(type: string): [stateKey: string, content: Record<string, unknown>][] {
    const out = new Map<string, Record<string, unknown>>();
    for (const name of typeAndLegacy(type)) {
      for (const [t, key, content] of this.entries) {
        if (t !== name || out.has(key)) continue;
        if (content && typeof content === 'object' && !Array.isArray(content)) {
          out.set(key, content as Record<string, unknown>);
        }
      }
    }
    return [...out];
  }
}

interface Slot {
  state: MudrixRoomState | null;
  at: number;
  loading: boolean;
}

const slots = new Map<string, Slot>();
const listeners = new Set<() => void>();
const queue: string[] = [];
let running = 0;
let boundClient: WizardClient | null = null;

function notify() {
  listeners.forEach((fn) => fn());
}

function slotOf(roomId: string): Slot {
  let slot = slots.get(roomId);
  if (!slot) {
    slot = { state: null, at: 0, loading: false };
    slots.set(roomId, slot);
  }
  return slot;
}

function pump(client: WizardClient) {
  while (running < MAX_PARALLEL && queue.length > 0) {
    const roomId = queue.shift()!;
    running++;
    client
      .stateEventsOfTypes(roomId, FETCHED_TYPES)
      .then(
        (entries) => {
          const slot = slotOf(roomId);
          slot.state = new MudrixRoomState(entries as Entry[]);
          syncVoiceFlag(roomId, slot.state);
        },
        () => {
          // A room that can't be read (left, or the server said no) simply has none of it.
          const slot = slotOf(roomId);
          slot.state ??= new MudrixRoomState([]);
        }
      )
      .finally(() => {
        const slot = slotOf(roomId);
        slot.at = Date.now();
        slot.loading = false;
        running--;
        notify();
        pump(client);
      });
  }
}

/** Asks for a room's state unless it is fresh or already on its way. */
export function ensureMudrixRoomState(roomId: string, force = false): void {
  const client = getMatrixClientOrNull();
  if (!client) return;
  if (boundClient !== client) {
    boundClient = client;
    slots.clear();
    forgetVoiceChannelFlags();
    queue.length = 0;
  }
  const slot = slotOf(roomId);
  if (slot.loading || (!force && slot.state && Date.now() - slot.at < FRESH_MS)) return;
  slot.loading = true;
  queue.push(roomId);
  pump(client);
}

/** Drops what is known about a room so the next reader asks again. */
export function refreshMudrixRoomState(roomId: string): void {
  const slot = slots.get(roomId);
  if (slot) slot.at = 0;
  if (listeners.size > 0) ensureMudrixRoomState(roomId, true);
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

const RELEVANT = new Set<string>([...FETCHED_TYPES, 'm.room.power_levels']);

if (typeof window !== 'undefined') {
  window.addEventListener('wizardchat:state', (event) => {
    const { roomId, eventType } = (event as CustomEvent<{ roomId: string; eventType: string }>)
      .detail;
    if (RELEVANT.has(eventType) && slots.has(roomId)) refreshMudrixRoomState(roomId);
  });
}

/**
 * The Mudrix state of a room (null until it is loaded), kept current: it is refreshed every minute
 * while something shows it and whenever the window comes back into view.
 */
export function useMudrixRoomState(roomId: string | null | undefined): MudrixRoomState | null {
  const state = useSyncExternalStore(subscribe, () => (roomId ? slots.get(roomId)?.state : null));
  useEffect(() => {
    if (!roomId) return;
    ensureMudrixRoomState(roomId);
    const timer = window.setInterval(() => ensureMudrixRoomState(roomId), FRESH_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible') ensureMudrixRoomState(roomId);
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [roomId]);
  return state ?? null;
}

/** The state of several rooms at once, each loaded once; for lists that look at many rooms. */
export function useMudrixRoomStates(
  roomIds: readonly string[]
): ReadonlyMap<string, MudrixRoomState> {
  const key = roomIds.join('|');
  const version = useSyncExternalStore(subscribe, () => {
    let sum = 0;
    for (const id of roomIds) sum += slots.get(id)?.at ?? 0;
    return sum;
  });
  useEffect(() => {
    for (const id of roomIds) ensureMudrixRoomState(id);
    // `key` stands for the list
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const map = new Map<string, MudrixRoomState>();
  for (const id of roomIds) {
    const state = slots.get(id)?.state;
    if (state) map.set(id, state);
  }
  void version;
  return map;
}

/**
 * Sets a Mudrix state event under its current name, and shows the change at once. Earlier Mudrix
 * versions read the old name, but this version only writes the current one (see `namespace.ts`).
 */
export async function setMudrixRoomState(
  client: WizardClient,
  roomId: string,
  type: string,
  content: Record<string, unknown>,
  stateKey = ''
): Promise<void> {
  await client.setStateEvent(roomId, type, stateKey, content as never);
  const slot = slotOf(roomId);
  const kept = [...(slot.state?.all(type) ?? [])]
    .filter(([key]) => key !== stateKey)
    .map(([key, value]) => [type, key, value] as Entry);
  const others = [...MUDRIX_ROOM_STATE_TYPES]
    .filter((other) => other !== type)
    .flatMap((other) =>
      (slot.state?.all(other) ?? []).map(([key, value]) => [other, key, value] as Entry)
    );
  slot.state = new MudrixRoomState([...others, ...kept, [type, stateKey, content]]);
  syncVoiceFlag(roomId, slot.state);
  slot.at = Date.now();
  notify();
}

function syncVoiceFlag(roomId: string, state: MudrixRoomState): void {
  rememberVoiceChannelFlag(roomId, state.get(mudrixKey('voice_channel'))?.['enabled'] === true);
}
