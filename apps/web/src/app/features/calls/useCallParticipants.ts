import { useMemo } from 'react';
import { liveStateByUser, useCallSnapshot, type CallLiveState } from './stage/useCallSnapshot';

const NO_LIVE_STATE = new Map<string, CallLiveState>();

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
