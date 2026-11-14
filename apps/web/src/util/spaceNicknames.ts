import type { SpaceNode } from '@wizardchat/core';
import { legacyMudrixKey, mudrixKey } from '@/util/namespace';

// Matrix names you per room, not per space, so a "nickname in this space" is kept as a wish in
// account data and written to the profile of every room of the space (and the space itself).
export const NICKNAMES_TYPE = mudrixKey('space_nicknames');
export const LEGACY_NICKNAMES_TYPE = legacyMudrixKey('space_nicknames');

export const MAX_NICKNAME_LENGTH = 255;

/** Space id to the nickname chosen for it, from the account data of the current or the old name. */
export function parseSpaceNicknames(
  ...contents: (Record<string, unknown> | null | undefined)[]
): Record<string, string> {
  const content = contents.find((c) => c && Object.keys(c).length > 0);
  const out: Record<string, string> = {};
  for (const [spaceId, name] of Object.entries(content ?? {})) {
    if (typeof name === 'string' && name.trim()) out[spaceId] = name;
  }
  return out;
}

/** The nicknames with one space's changed (null or empty removes it). */
export function withSpaceNickname(
  nicknames: Record<string, string>,
  spaceId: string,
  nickname: string | null
): Record<string, string> {
  const next = { ...nicknames };
  const trimmed = nickname?.trim().slice(0, MAX_NICKNAME_LENGTH);
  if (trimmed) next[spaceId] = trimmed;
  else delete next[spaceId];
  return next;
}

/**
 * The space and every room below it (sub-spaces included) that you have joined. `joined` says
 * which room ids you are in.
 */
export function joinedRoomsOfSpace(
  graph: readonly SpaceNode[],
  joined: ReadonlySet<string>,
  spaceId: string
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const visit = (roomId: string) => {
    if (seen.has(roomId)) return;
    seen.add(roomId);
    if (joined.has(roomId)) out.push(roomId);
    for (const child of graph.find((s) => s.spaceId === roomId)?.children ?? [])
      visit(child.roomId);
  };
  visit(spaceId);
  return out;
}

/**
 * The nickname each joined room should show you under. A room in a space with a nickname of its own
 * (a sub-space) shows that one rather than its parent's; a room reached from several unrelated
 * spaces takes the same one every time, so two nicknames never fight over it.
 */
export function nicknameTargets(
  graph: readonly SpaceNode[],
  joined: ReadonlySet<string>,
  nicknames: Record<string, string>
): Map<string, string> {
  const spaces = Object.entries(nicknames)
    .filter(([spaceId]) => joined.has(spaceId))
    .map(([spaceId, nickname]) => ({
      spaceId,
      nickname,
      rooms: joinedRoomsOfSpace(graph, joined, spaceId),
    }))
    // The closest space is the one with the fewest rooms below it; ties go by id.
    .sort((a, b) => b.rooms.length - a.rooms.length || (a.spaceId < b.spaceId ? 1 : -1));
  const targets = new Map<string, string>();
  // Widest first, so each narrower space overwrites what it sits inside.
  for (const { rooms, nickname } of spaces) {
    for (const roomId of rooms) targets.set(roomId, nickname);
  }
  return targets;
}

/** A stable text for a set of targets, to tell whether anything changed. */
export function targetsKey(targets: ReadonlyMap<string, string>): string {
  return [...targets]
    .map(([room, name]) => `${room}\u0000${name}`)
    .sort()
    .join('\u0001');
}
