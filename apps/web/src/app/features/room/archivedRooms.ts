import type { HierarchyItem, HierarchyRoomItem } from './useSpaceHierarchy';

/**
 * Splits a room list into the main list and the Archived section, keeping the original order.
 * Archived rooms leave every main group; the section is rendered last and only when non-empty.
 */
export function splitArchived<T>(
  items: readonly T[],
  isArchived: (item: T) => boolean
): { active: T[]; archived: T[] } {
  const active: T[] = [];
  const archived: T[] = [];
  for (const item of items) {
    if (isArchived(item)) archived.push(item);
    else active.push(item);
  }
  return { active, archived };
}

/**
 * Splits a space's hierarchy: archived room rows leave their category (and any favourite or low
 * priority group they would join) for the Archived section. Space headers stay in place.
 */
export function splitArchivedHierarchy(items: readonly HierarchyItem[]): {
  active: HierarchyItem[];
  archived: HierarchyRoomItem[];
} {
  const active: HierarchyItem[] = [];
  const archived: HierarchyRoomItem[] = [];
  for (const item of items) {
    if (item.kind === 'room' && item.entry.room.isArchived) archived.push(item);
    else active.push(item);
  }
  return { active, archived };
}
