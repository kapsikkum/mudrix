import { useEffect, useRef } from 'react';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import { callSessionAtom } from '@/app/store/atoms/call';
import { useCallSnapshot } from '@/app/features/calls/stage/useCallSnapshot';
import {
  WATCH_TOPIC,
  expectedPosition,
  parseWatchMessage,
  watchActionsAtom,
  watchStateAtom,
  watchingVideoIdAtom,
  type WatchMessage,
  type WatchState,
} from './watchTogether';
import { WatchTogetherDialog } from './WatchTogetherDialog';
import { playVoiceSound } from '@/app/features/voice/voiceSounds';

const LATE_JOIN_REQUEST_DELAY_MS = 1500;
const HEARTBEAT_MS = 10_000;
const OFFSET_SAMPLES = 10;
const START_SOUND_WINDOW_S = 5;

export function WatchTogetherController() {
  const session = useAtomValue(callSessionAtom);
  const snapshot = useCallSnapshot();
  const phase = snapshot?.phase;
  const participantsRef = useRef(snapshot?.participants ?? []);
  participantsRef.current = snapshot?.participants ?? [];
  const [state, setState] = useAtom(watchStateAtom);
  const setActions = useSetAtom(watchActionsAtom);
  const setWatching = useSetAtom(watchingVideoIdAtom);
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    setState(null);
    setWatching(null);
    if (!session) {
      setActions(null);
      return;
    }
    let stoppedAt = 0;
    const myId = session.matrixRoom.client.getUserId() ?? '';
    const send = (msg: WatchMessage) => {
      void session.sendData(WATCH_TOPIC, msg).catch(() => {});
    };
    const publish = (next: WatchState) => {
      stateRef.current = next;
      setState(next);
      send({ t: 'state', state: next, sentAt: Date.now() });
    };

    const offsets = new Map<string, number[]>();
    const clockOffset = (from: string, sentAt: number) => {
      const samples = [...(offsets.get(from) ?? []), Date.now() - sentAt].slice(-OFFSET_SAMPLES);
      offsets.set(from, samples);
      return Math.min(...samples);
    };

    const off = session.onData((topic, payload, from) => {
      if (topic !== WATCH_TOPIC) return;
      const msg = parseWatchMessage(payload);
      if (!msg) return;
      if (msg.t === 'request') {
        const current = stateRef.current;
        if (current) send({ t: 'state', state: current, sentAt: Date.now() });
        return;
      }
      if (msg.t === 'stop') {
        stoppedAt = Date.now();
        stateRef.current = null;
        setState(null);
        return;
      }
      const incoming = { ...msg.state, at: msg.state.at + clockOffset(from, msg.sentAt) };
      if (incoming.at <= stoppedAt) return;
      const current = stateRef.current;
      if (current && incoming.at < current.at) return;
      stateRef.current = incoming;
      setState(incoming);
    });

    setActions({
      start: (videoId) =>
        publish({ videoId, startedBy: myId, playing: true, position: 0, at: Date.now() }),
      update: (playing, position) => {
        const current = stateRef.current;
        if (current) publish({ ...current, playing, position, at: Date.now() });
      },
      stop: () => {
        stoppedAt = Date.now();
        stateRef.current = null;
        setState(null);
        send({ t: 'stop', sentAt: Date.now() });
      },
    });

    const heartbeat = setInterval(() => {
      const current = stateRef.current;
      if (!current) return;
      const present = participantsRef.current
        .filter((p) => p.connected)
        .sort((a, b) => (a.id < b.id ? -1 : 1));
      const leader = present.find((p) => p.userId === current.startedBy) ?? present[0];
      if (!leader?.isLocal) return;
      publish({ ...current, position: expectedPosition(current), at: Date.now() });
    }, HEARTBEAT_MS);

    return () => {
      off();
      clearInterval(heartbeat);
      setActions(null);
    };
  }, [session, setState, setActions, setWatching]);

  const lastVideoRef = useRef<string | null>(null);
  useEffect(() => {
    const videoId = state?.videoId ?? null;
    if (
      state &&
      videoId !== lastVideoRef.current &&
      expectedPosition(state) < START_SOUND_WINDOW_S
    ) {
      playVoiceSound('watch-together-start');
    }
    lastVideoRef.current = videoId;
  }, [state]);

  useEffect(() => {
    if (!session || phase !== 'joined') return;
    const timer = setTimeout(() => {
      if (!stateRef.current) void session.sendData(WATCH_TOPIC, { t: 'request' }).catch(() => {});
    }, LATE_JOIN_REQUEST_DELAY_MS);
    return () => clearTimeout(timer);
  }, [session, phase]);

  return <WatchTogetherDialog />;
}
