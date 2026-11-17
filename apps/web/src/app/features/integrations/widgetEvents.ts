interface TimedEvent {
  eventId: string;
  originServerTs: number;
}

/**
 * The newest `max` of two event lists as one, oldest first and without repeats. Sync redelivers
 * recent history, so an event can be in both.
 */
export function mergeRoomEvents<T extends TimedEvent>(
  current: readonly T[],
  incoming: readonly T[],
  max: number
): T[] {
  const byId = new Map<string, T>();
  for (const ev of current) byId.set(ev.eventId, ev);
  for (const ev of incoming) if (!byId.has(ev.eventId)) byId.set(ev.eventId, ev);
  const all = [...byId.values()].sort((a, b) => a.originServerTs - b.originServerTs);
  return all.length > max ? all.slice(all.length - max) : all;
}
