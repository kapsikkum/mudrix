import { useMemo } from 'react';
import { useAtomValue } from 'jotai';
import { callUiAtom } from '@/app/store/atoms/call';
import type { VoiceParticipant } from '@/app/features/calls/types';
import { getMatrixClientOrNull } from '@/client/initMatrix';
import { formatUserId } from '@/util/matrix';
import { useCallMemberships, uniqueMembers } from './useCallMemberships';
import { liveStateByUser, useCallSnapshot, type CallLiveState } from './stage/useCallSnapshot';

const NO_LIVE_STATE = new Map<string, CallLiveState>();

export { uniqueMembers };

// Live state of a room's call participants; only known while we are in that call
export function useCallLiveState(roomId: string): Map<string, CallLiveState> {
  const snapshot = useCallSnapshot();
  return useMemo(
    () => (snapshot && snapshot.roomId === roomId ? liveStateByUser(snapshot) : NO_LIVE_STATE),
    [snapshot, roomId]
  );
}

// True once we are connected and the call stage has something to show
export function useCallTileVisible(): boolean {
  return useCallSnapshot()?.phase === 'joined';
}

export function useCallParticipants(roomId: string): VoiceParticipant[] {
  const client = getMatrixClientOrNull();
  const ui = useAtomValue(callUiAtom);
  const membershipsMap = useCallMemberships(client, [roomId]);
  const memberships = useMemo(() => membershipsMap.get(roomId) ?? [], [membershipsMap, roomId]);
  const liveState = useCallLiveState(roomId);
  const localInCall = ui.roomId === roomId;

  const participants = useMemo(() => {
    const myUserId = client?.userId();

    const result: VoiceParticipant[] = uniqueMembers(memberships).map((member) => {
      const userId = member.userId;
      const live = liveState.get(userId);
      const isLocal = userId === myUserId;

      return {
        userId,
        name: member.displayName ?? formatUserId(member.userId),
        mxcAvatar: member.avatarUrl,
        muted: localInCall ? (live ? live.muted : isLocal ? ui.isMuted : false) : false,
        videoMuted: localInCall
          ? live
            ? live.videoMuted
            : isLocal
              ? ui.isVideoMuted
              : true
          : true,
        screensharing: localInCall ? (live?.screensharing ?? false) : false,
        speaking: localInCall ? (live?.speaking ?? false) : false,
      };
    });

    return result;
  }, [client, memberships, liveState, localInCall, ui.isMuted, ui.isVideoMuted]);

  return participants;
}
