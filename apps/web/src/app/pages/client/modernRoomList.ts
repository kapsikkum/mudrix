import type { HierarchyItem, HierarchyRoomItem } from '@/app/features/room/useSpaceHierarchy';

/**
 * The Modern list style's view of a space's hierarchy: rooms flagged as voice channels count as
 * voice rooms, and inside each category the voice channels sit below the text channels (each kind
 * keeps its own order).
 */
export function arrangeModernItems(
  items: HierarchyItem[],
  flaggedVoice: ReadonlySet<string>
): HierarchyItem[] {
  const out: HierarchyItem[] = [];
  let run: HierarchyRoomItem[] = [];
  const flush = () => {
    out.push(
      ...run.filter((r) => !r.entry.hasVoiceRoom),
      ...run.filter((r) => r.entry.hasVoiceRoom)
    );
    run = [];
  };
  for (const item of items) {
    if (item.kind !== 'room') {
      flush();
      out.push(item);
      continue;
    }
    run.push(
      flaggedVoice.has(item.roomId) && !item.entry.hasVoiceRoom
        ? { ...item, entry: { ...item.entry, hasVoiceRoom: true } }
        : item
    );
  }
  flush();
  return out;
}

/** Each category's parent (the space it sits in), read from the order and depth of the headers. */
export function categoryParentsOf(items: HierarchyItem[]): Map<string, string> {
  const parents = new Map<string, string>();
  const stack: string[] = [];
  for (const item of items) {
    if (item.kind !== 'space') continue;
    stack.length = item.depth;
    if (item.depth > 0 && stack[item.depth - 1]) parents.set(item.roomId, stack[item.depth - 1]);
    stack[item.depth] = item.roomId;
  }
  return parents;
}
