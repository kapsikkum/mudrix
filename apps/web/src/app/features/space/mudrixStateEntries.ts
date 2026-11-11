import { typeAndLegacy } from '@/util/namespace';

/** One Mudrix state event of a room: what it says, who sent it and when. */
export interface StateEntry {
  type: string;
  stateKey: string;
  content: unknown;
  sender: string;
  /** Milliseconds; 0 when the server sent none. */
  ts: number;
  eventId: string | null;
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);

/** What a room holds of the Mudrix state types, current names first, legacy names as a fallback. */
export class MudrixRoomState {
  private readonly entries: readonly StateEntry[];

  constructor(entries: readonly StateEntry[]) {
    this.entries = entries;
  }

  /** The entry under `type` (or its legacy name) and `stateKey`, who sent it included. */
  entry(type: string, stateKey = ''): StateEntry | undefined {
    for (const name of typeAndLegacy(type)) {
      const found = this.entries.find((e) => e.type === name && e.stateKey === stateKey);
      if (found && isRecord(found.content)) return found;
    }
    return undefined;
  }

  /** The content under `type` (or its legacy name) and `stateKey`. */
  get(type: string, stateKey = ''): Record<string, unknown> | undefined {
    return this.entry(type, stateKey)?.content as Record<string, unknown> | undefined;
  }

  /** Every state key's entry under `type`; a key set under both names counts once, current first. */
  allEntries(type: string): StateEntry[] {
    const out = new Map<string, StateEntry>();
    for (const name of typeAndLegacy(type)) {
      for (const e of this.entries) {
        if (e.type !== name || out.has(e.stateKey) || !isRecord(e.content)) continue;
        out.set(e.stateKey, e);
      }
    }
    return [...out.values()];
  }

  /** Every state key's content under `type`. */
  all(type: string): [stateKey: string, content: Record<string, unknown>][] {
    return this.allEntries(type).map((e) => [e.stateKey, e.content as Record<string, unknown>]);
  }

  list(): readonly StateEntry[] {
    return this.entries;
  }
}

export const entryId = (type: string, stateKey: string) => `${type}\u0000${stateKey}`;

/** Whether two entries say the same thing (so a repeat changes nothing). */
function sameEntry(a: StateEntry, b: StateEntry): boolean {
  return (
    a.sender === b.sender &&
    a.eventId === b.eventId &&
    JSON.stringify(a.content) === JSON.stringify(b.content)
  );
}

/**
 * Puts an entry in a room's current state. A live event always replaces what is there (events come
 * in order); an entry read from the device (`fill`) only fills what is still unknown. Returns
 * whether anything changed.
 */
export function putEntry(
  current: Map<string, StateEntry>,
  entry: StateEntry,
  fill = false
): boolean {
  const id = entryId(entry.type, entry.stateKey);
  const existing = current.get(id);
  if (existing && (fill || sameEntry(existing, entry))) return false;
  current.set(id, entry);
  return true;
}

export const MAX_LOG = 200;

/**
 * Adds an entry to a room's history of changes (newest last, no event twice). Entries read from the
 * device have no event id for a repeat check other than the id itself. Returns whether it was new.
 */
export function logEntry(log: StateEntry[], entry: StateEntry): boolean {
  if (entry.eventId && log.some((e) => e.eventId === entry.eventId)) return false;
  if (!entry.eventId) return false;
  log.push(entry);
  log.sort((a, b) => a.ts - b.ts);
  if (log.length > MAX_LOG) log.splice(0, log.length - MAX_LOG);
  return true;
}
