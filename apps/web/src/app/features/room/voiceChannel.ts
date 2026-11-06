import { useMemo } from 'react';
import type { WizardClient } from '@wizardchat/core';
import { useSpaceGraph } from '@/app/data';
import { findParentSpaceId } from '@/util/matrix';
import { mudrixKey } from '@/util/namespace';
import { useSpaceListStyle } from '@/app/features/space/spaceListStyle';
import {
  setMudrixRoomState,
  useMudrixRoomState,
  useMudrixRoomStates,
  type MudrixRoomState,
} from '@/app/features/space/mudrixRoomState';

/** A Mudrix user can dedicate a plain text room as a voice channel with a state event on it. */
export const VOICE_CHANNEL_STATE_TYPE = mudrixKey('voice_channel');

export function isVoiceChannelFlagged(state: MudrixRoomState | null | undefined): boolean {
  return state?.get(VOICE_CHANNEL_STATE_TYPE)?.['enabled'] === true;
}

export function setVoiceChannel(
  client: WizardClient,
  roomId: string,
  enabled: boolean
): Promise<void> {
  return setMudrixRoomState(client, roomId, VOICE_CHANNEL_STATE_TYPE, { enabled });
}

/**
 * Whether a room is a flagged voice channel. Only rooms in a Modern space can be (the flag is a
 * Modern list feature), so other rooms are never asked about.
 */
export function useVoiceChannelFlag(roomId: string | null | undefined): boolean {
  const graph = useSpaceGraph();
  const parent = roomId ? findParentSpaceId(roomId, graph) : null;
  const modern = useSpaceListStyle(parent) === 'modern';
  return isVoiceChannelFlagged(useMudrixRoomState(modern ? roomId : null));
}

/** The ids among `roomIds` that are flagged voice channels (loaded a few at a time). */
export function useFlaggedVoiceChannels(roomIds: readonly string[]): ReadonlySet<string> {
  const states = useMudrixRoomStates(roomIds);
  const flagged = roomIds.filter((id) => isVoiceChannelFlagged(states.get(id))).join('|');
  return useMemo(() => new Set(flagged ? flagged.split('|') : []), [flagged]);
}
