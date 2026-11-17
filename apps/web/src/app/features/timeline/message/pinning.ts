import type { RoomTimeline } from '@mudrix/core';

export function isPinnedEvent(
  pinnedIds: readonly string[] | null | undefined,
  eventId: string
): boolean {
  return !!pinnedIds && pinnedIds.includes(eventId);
}

export async function togglePin(
  timeline: RoomTimeline,
  eventId: string,
  currentlyPinned: boolean
): Promise<void> {
  if (currentlyPinned) await timeline.unpin(eventId);
  else await timeline.pin(eventId);
}
