import { useMemo } from 'react';
import { atom } from 'jotai';
import type { SpaceNode, WizardClient } from '@wizardchat/core';
import { useSpaceGraph } from '@/app/data';
import { mudrixKey } from '@/util/namespace';
import { setMudrixRoomState, useMudrixRoomState, type MudrixRoomState } from './mudrixRoomState';

/**
 * How a space's rooms are listed: 'matrix' (an avatar on every room) or 'modern' (plain channel
 * rows, voice channels, a set order). It belongs to the space, so everyone sees the same list, and
 * whoever may change the space's state sets it. A space with none set is 'matrix'. A space inside
 * another one (a category pinned to the sidebar) follows the top space it is in.
 */
export type RoomListStyle = 'matrix' | 'modern';

export const SPACE_LIST_STYLE_STATE_TYPE = mudrixKey('space_list_style');

export const DEFAULT_SPACE_LIST_STYLE: RoomListStyle = 'matrix';

/** The style of the space being listed, so row components can drop what Modern does not show. */
export const activeRoomListStyleAtom = atom<RoomListStyle>(DEFAULT_SPACE_LIST_STYLE);

/** The top space `spaceId` is in (itself when it has no parent), following the first parent. */
export function rootSpaceOf(graph: SpaceNode[], spaceId: string): string {
  const seen = new Set<string>([spaceId]);
  let current = spaceId;
  for (;;) {
    const at = current;
    const parent = graph.find(
      (s) => !seen.has(s.spaceId) && s.children.some((child) => child.roomId === at)
    );
    if (!parent) return current;
    seen.add(parent.spaceId);
    current = parent.spaceId;
  }
}

export function styleOf(state: MudrixRoomState | null | undefined): RoomListStyle {
  return state?.get(SPACE_LIST_STYLE_STATE_TYPE)?.['style'] === 'modern'
    ? 'modern'
    : DEFAULT_SPACE_LIST_STYLE;
}

export function useSpaceListStyle(spaceId: string | null | undefined): RoomListStyle {
  const graph = useSpaceGraph();
  const root = useMemo(() => (spaceId ? rootSpaceOf(graph, spaceId) : null), [graph, spaceId]);
  return styleOf(useMudrixRoomState(root));
}

export function setSpaceListStyle(
  client: WizardClient,
  spaceId: string,
  style: RoomListStyle
): Promise<void> {
  return setMudrixRoomState(client, spaceId, SPACE_LIST_STYLE_STATE_TYPE, { style });
}
