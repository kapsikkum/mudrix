import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { WizardClient, type StateEventView } from '@wizardchat/core';
import { getMatrixClientOrNull } from '@/client/initMatrix';
import { mudrixKey, typeAndLegacy } from '@/util/namespace';
import { forgetVoiceChannelFlags, rememberVoiceChannelFlag } from '@/util/voiceChannelFlags';
import { MudrixRoomState, logEntry, putEntry, type StateEntry } from './mudrixStateEntries';

export { MudrixRoomState } from './mudrixStateEntries';
export type { StateEntry } from './mudrixStateEntries';

/**
 * Mudrix keeps a few things in state events on a space or room (list style, banner, auto-join,
 * roles, voice channel, soundboard). The core brings them with sync, so this store reads a room's
 * once from the device (`stateEventsWithSender`) and then follows every change as it arrives
 * (`watchStateEvents`): no polling. Each entry keeps who sent it, which the roles need.
 */
export const MUDRIX_ROOM_STATE_TYPES = [
  mudrixKey('space_list_style'),
  mudrixKey('space_banner'),
  mudrixKey('space_auto_join'),
  mudrixKey('space_roles'),
  mudrixKey('space_member_roles'),
  mudrixKey('voice_channel'),
  mudrixKey('soundboard'),
  mudrixKey('soundboard.settings'),
] as const;

const FALLBACK_TYPES = MUDRIX_ROOM_STATE_TYPES.flatMap((type) => [...typeAndLegacy(type)]);
/** Role changes are kept as a history for the audit log. */
const LOGGED_TYPES = new Set(
  [mudrixKey('space_roles'), mudrixKey('space_member_roles')].flatMap((type) => [
    ...typeAndLegacy(type),
  ])
);
const MAX_PARALLEL = 4;
const RETRY_AFTER_FAILURE_MS = 60_000;
const NOTIFY_DELAY_MS = 40;

interface Slot {
  events: Map<string, StateEntry>;
  log: StateEntry[];
  /** What readers get: null until the room was read once. */
  published: MudrixRoomState | null;
  loaded: boolean;
  failedAt: number;
  loading: Promise<void> | null;
  /** Bumped whenever the state changes. */
  version: number;
  logVersion: number;
}

const slots = new Map<string, Slot>();
const listeners = new Set<() => void>();
const queue: (() => void)[] = [];
let running = 0;
let boundClient: WizardClient | null = null;
let watch: { cancel(): void } | null = null;
let types: string[] = FALLBACK_TYPES;
let notifyTimer: ReturnType<typeof setTimeout> | null = null;

function notify() {
  if (notifyTimer !== null) return;
  notifyTimer = setTimeout(() => {
    notifyTimer = null;
    listeners.forEach((fn) => fn());
  }, NOTIFY_DELAY_MS);
}

function slotOf(roomId: string): Slot {
  let slot = slots.get(roomId);
  if (!slot) {
    slot = {
      events: new Map(),
      log: [],
      published: null,
      loaded: false,
      failedAt: 0,
      loading: null,
      version: 0,
      logVersion: 0,
    };
    slots.set(roomId, slot);
  }
  return slot;
}

/** Rebuilds what readers see after the room's entries changed. */
function changed(roomId: string, slot: Slot) {
  const state = new MudrixRoomState([...slot.events.values()]);
  rememberVoiceChannelFlag(roomId, state.get(mudrixKey('voice_channel'))?.['enabled'] === true);
  slot.version += 1;
  if (slot.loaded) slot.published = state;
  notify();
}

function entryOf(view: StateEventView): StateEntry {
  return {
    type: view.type,
    stateKey: view.stateKey,
    content: view.content,
    sender: view.sender,
    ts: view.originServerTs,
    eventId: view.eventId,
  };
}

function onEvent(view: StateEventView) {
  const slot = slotOf(view.roomId);
  const entry = entryOf(view);
  let touched = putEntry(slot.events, entry);
  if (LOGGED_TYPES.has(entry.type) && logEntry(slot.log, entry)) {
    slot.logVersion += 1;
    touched = true;
  }
  if (touched) changed(view.roomId, slot);
}

/** Follows Mudrix's state in every room for this client. Safe to call again. */
export function bindMudrixState(client: WizardClient): void {
  if (boundClient === client) return;
  watch?.cancel();
  boundClient = client;
  slots.clear();
  queue.length = 0;
  forgetVoiceChannelFlags();
  notify();
  void WizardClient.mudrixStateTypes()
    .then((list) => {
      types = list;
    })
    .catch(() => {})
    .finally(() => {
      if (boundClient === client) watch = client.watchStateEvents(types, onEvent);
    });
}

function pump() {
  while (running < MAX_PARALLEL && queue.length > 0) {
    running += 1;
    queue.shift()!();
  }
}

/** Reads a room's Mudrix state once (from the device); resolves with it, empty when unreadable. */
export function loadMudrixRoomState(roomId: string): Promise<MudrixRoomState | null> {
  const client = getMatrixClientOrNull();
  if (!client) return Promise.resolve(null);
  bindMudrixState(client);
  const slot = slotOf(roomId);
  const retry = slot.failedAt > 0 && Date.now() - slot.failedAt > RETRY_AFTER_FAILURE_MS;
  if (slot.loaded && !retry) return Promise.resolve(slot.published);
  slot.loading ??= new Promise<void>((resolve) => {
    queue.push(() => {
      client
        .stateEventsWithSender(roomId, types)
        .then(
          (views) => {
            slot.failedAt = 0;
            for (const view of views) {
              const entry = entryOf(view);
              putEntry(slot.events, entry, true);
              if (LOGGED_TYPES.has(entry.type) && logEntry(slot.log, entry)) slot.logVersion += 1;
            }
          },
          () => {
            // A room that can't be read (left, or the server said no) simply has none of it.
            slot.failedAt = Date.now();
          }
        )
        .finally(() => {
          slot.loaded = true;
          slot.loading = null;
          running -= 1;
          changed(roomId, slot);
          resolve();
          pump();
        });
    });
    pump();
  });
  return slot.loading.then(() => slot.published);
}

/** Asks for a room's state unless it is already known or on its way. */
export function ensureMudrixRoomState(roomId: string): void {
  void loadMudrixRoomState(roomId);
}

/** What is known about a room without asking (null before it was read). */
export function getMudrixRoomState(roomId: string): MudrixRoomState | null {
  return slots.get(roomId)?.published ?? null;
}

/** Calls `listener` whenever any room's Mudrix state changed; returns the unsubscribe. */
export function subscribeMudrixRoomState(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Starts following Mudrix's state as soon as the client is there. */
export function useMudrixStateWatch(client: WizardClient | null): void {
  useEffect(() => {
    if (client) bindMudrixState(client);
  }, [client]);
}

/** The Mudrix state of a room (null until it is loaded), kept current by the core's events. */
export function useMudrixRoomState(roomId: string | null | undefined): MudrixRoomState | null {
  const state = useSyncExternalStore(subscribeMudrixRoomState, () =>
    roomId ? (slots.get(roomId)?.published ?? null) : null
  );
  useEffect(() => {
    if (roomId) ensureMudrixRoomState(roomId);
  }, [roomId]);
  return state;
}

/** The state of several rooms at once, each loaded once; for lists that look at many rooms. */
export function useMudrixRoomStates(
  roomIds: readonly string[]
): ReadonlyMap<string, MudrixRoomState> {
  const key = roomIds.join('|');
  const version = useSyncExternalStore(subscribeMudrixRoomState, () => {
    let sum = 0;
    for (const id of roomIds)
      sum += (slots.get(id)?.version ?? 0) + (slots.get(id)?.loaded ? 1 : 0);
    return sum;
  });
  useEffect(() => {
    for (const id of roomIds) ensureMudrixRoomState(id);
    // `key` stands for the list
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return useMemo(() => {
    const map = new Map<string, MudrixRoomState>();
    for (const id of roomIds) {
      const state = slots.get(id)?.published;
      if (state) map.set(id, state);
    }
    return map;
    // `version` stands for the states, `key` for the list
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version, key]);
}

/**
 * The role changes seen in a room (newest first): the current ones read from the device and the
 * ones that arrived while the app was open. The core does not give the older history.
 */
export function useMudrixRoleLog(roomId: string | null | undefined): StateEntry[] {
  const version = useSyncExternalStore(subscribeMudrixRoomState, () =>
    roomId ? (slots.get(roomId)?.logVersion ?? 0) : 0
  );
  useEffect(() => {
    if (roomId) ensureMudrixRoomState(roomId);
  }, [roomId]);
  return useMemo(
    () => (roomId ? [...(slots.get(roomId)?.log ?? [])].reverse() : []),
    // `version` stands for the log
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [roomId, version]
  );
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
  bindMudrixState(client);
  const slot = slotOf(roomId);
  putEntry(slot.events, {
    type,
    stateKey,
    content,
    sender: client.userId() ?? '',
    ts: Date.now(),
    eventId: null,
  });
  changed(roomId, slot);
  // The room may not have been read yet: do it now, keeping what was just written.
  await loadMudrixRoomState(roomId);
}
