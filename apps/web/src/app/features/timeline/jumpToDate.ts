import type { SearchDirection, TimestampEvent } from '@wizardchat/core';

/** Formats a Date as the `YYYY-MM-DD` value a date input expects (local time). */
export function toDateInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Parses a `YYYY-MM-DD` input value as local midnight (not UTC). */
export function startOfLocalDay(value: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getTime();
}

type Lookup = (timestamp: number, direction: SearchDirection) => Promise<TimestampEvent | null>;

/**
 * The event to open for a date: the first one at or after it, or the closest earlier one when
 * the room has nothing newer (jumping to a date past its last message). Null for an empty room.
 */
export async function eventNearDate(lookup: Lookup, timestamp: number): Promise<string | null> {
  const forward = await lookup(timestamp, 'forward');
  if (forward) return forward.eventId;
  const backward = await lookup(timestamp, 'backward');
  return backward?.eventId ?? null;
}

/** The locale key for why a jump failed. */
export function jumpToDateErrorKey(error: unknown): string {
  const code = (error as { code?: unknown } | null)?.code;
  return code === 'unsupportedByServer' ? 'room.jumpToDate.unsupported' : 'room.jumpToDate.failed';
}
