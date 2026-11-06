import { useMemo } from 'react';
import type { WizardClient } from '@wizardchat/core';
import { useSpaceGraph } from '@/app/data';
import { mudrixKey } from '@/util/namespace';
import { setMudrixRoomState, useMudrixRoomState, type MudrixRoomState } from './mudrixRoomState';
import { rootSpaceOf, styleOf } from './spaceListStyle';

/**
 * Whether people who join a space are joined to everything in it. Matrix has no such setting, so
 * Mudrix keeps it in a state event on the space; whoever may change the space's state sets it.
 *
 * With no event set, a Modern style space auto-joins (its list only shows rooms you are in, so it
 * would look empty otherwise) and a Matrix style one does not. A set event always wins.
 */
export const SPACE_AUTO_JOIN_STATE_TYPE = mudrixKey('space_auto_join');

/** The space's own setting, or null when it has none and the list style decides. */
export function explicitAutoJoinOf(state: MudrixRoomState | null | undefined): boolean | null {
  const enabled = state?.get(SPACE_AUTO_JOIN_STATE_TYPE)?.['enabled'];
  return typeof enabled === 'boolean' ? enabled : null;
}

export function setSpaceAutoJoin(
  client: WizardClient,
  spaceId: string,
  enabled: boolean
): Promise<void> {
  return setMudrixRoomState(client, spaceId, SPACE_AUTO_JOIN_STATE_TYPE, { enabled });
}

/** The space's setting (or its default from the list style of the top space), kept current. */
export function useSpaceAutoJoin(spaceId: string | null | undefined): boolean {
  const graph = useSpaceGraph();
  const own = useMudrixRoomState(spaceId);
  const root = useMemo(() => (spaceId ? rootSpaceOf(graph, spaceId) : null), [graph, spaceId]);
  const rootState = useMudrixRoomState(root);
  return explicitAutoJoinOf(own) ?? styleOf(rootState) === 'modern';
}
