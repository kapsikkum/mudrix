import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ArrowSquareOutIcon,
  ArrowsOutSimpleIcon,
  EyeSlashIcon,
  XIcon,
  YoutubeLogoIcon,
} from '@phosphor-icons/react';
import { useSetAtom } from 'jotai';
import { Tooltip } from '@/app/components/Tooltip';
import {
  expectedPosition,
  watchingVideoIdAtom,
  youtubeWatchUrl,
  type WatchState,
} from './watchTogether';
import { YT_STATE, createYouTubePlayer, type YTPlayer } from './youtube';
import * as css from './WatchTogether.css';

const DRIFT_TOLERANCE_S = 1.5;
const SEEK_JUMP_S = 1.5;
const ECHO_WINDOW_MS = 1500;
const TICK_MS = 500;

interface Sample {
  time: number;
  at: number;
  playing: boolean;
}

interface Props {
  state: WatchState;
  startedByName: string;
  compact?: boolean;
  onUpdate: (playing: boolean, position: number) => void;
  onStop: () => void;
  onFocus?: () => void;
}

export function WatchTogetherPlayer({
  state,
  startedByName,
  compact,
  onUpdate,
  onStop,
  onFocus,
}: Props) {
  const { t } = useTranslation();
  const hostRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YTPlayer | null>(null);
  const readyRef = useRef(false);
  const stateRef = useRef(state);
  stateRef.current = state;
  const echoUntilRef = useRef(0);
  const lastPlayerStateRef = useRef<number>(YT_STATE.UNSTARTED);
  const steadyRef = useRef<Sample | null>(null);
  const onUpdateRef = useRef(onUpdate);
  onUpdateRef.current = onUpdate;
  const [failed, setFailed] = useState<'video' | 'bridge' | null>(null);
  const setWatching = useSetAtom(watchingVideoIdAtom);

  const apply = useCallback((s: WatchState) => {
    const player = playerRef.current;
    if (!player || !readyRef.current) return;
    echoUntilRef.current = Date.now() + ECHO_WINDOW_MS;
    const target = expectedPosition(s);
    const currentId = player.getVideoData?.().video_id;
    if (currentId && currentId !== s.videoId) {
      steadyRef.current = null;
      if (s.playing) player.loadVideoById({ videoId: s.videoId, startSeconds: target });
      else player.cueVideoById({ videoId: s.videoId, startSeconds: target });
      return;
    }
    if (Math.abs(player.getCurrentTime() - target) > DRIFT_TOLERANCE_S) {
      steadyRef.current = null;
      player.seekTo(target, true);
    }
    const playerState = player.getPlayerState();
    const running = playerState === YT_STATE.PLAYING || playerState === YT_STATE.BUFFERING;
    if (s.playing && !running) player.playVideo();
    if (!s.playing && running) player.pauseVideo();
  }, []);

  const handlePlayerState = useCallback((playerState: number) => {
    const player = playerRef.current;
    const s = stateRef.current;
    const previous = lastPlayerStateRef.current;
    lastPlayerStateRef.current = playerState;
    if (!player || !s) return;
    const current = player.getCurrentTime();
    const isEcho = Date.now() < echoUntilRef.current;

    if (playerState === YT_STATE.PLAYING) {
      const firstStart = previous === YT_STATE.UNSTARTED || previous === YT_STATE.CUED;
      if (firstStart && Math.abs(current - expectedPosition(s)) > DRIFT_TOLERANCE_S) {
        echoUntilRef.current = Date.now() + ECHO_WINDOW_MS;
        steadyRef.current = null;
        player.seekTo(expectedPosition(s), true);
        if (!s.playing) player.pauseVideo();
        return;
      }
      if (!isEcho && !s.playing) onUpdateRef.current(true, current);
    } else if (playerState === YT_STATE.PAUSED) {
      if (!isEcho && s.playing) onUpdateRef.current(false, current);
    } else if (playerState === YT_STATE.ENDED) {
      if (s.playing) onUpdateRef.current(false, player.getDuration());
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const host = hostRef.current;
    if (host) {
      const initial = stateRef.current;
      playerRef.current = createYouTubePlayer(host, {
        videoId: initial.videoId,
        autoplay: initial.playing,
        start: expectedPosition(initial),
        onReady: () => {
          readyRef.current = true;
          apply(stateRef.current);
        },
        onStateChange: handlePlayerState,
        onError: (kind) => {
          if (!cancelled) setFailed(kind);
        },
      });
    }
    return () => {
      cancelled = true;
      readyRef.current = false;
      playerRef.current?.destroy();
      playerRef.current = null;
    };
  }, [apply, handlePlayerState]);

  useEffect(() => apply(state), [state, apply]);

  useEffect(() => setFailed((kind) => (kind === 'video' ? null : kind)), [state.videoId]);

  useEffect(() => {
    const timer = setInterval(() => {
      const player = playerRef.current;
      const s = stateRef.current;
      if (!player || !readyRef.current) return;
      const playerState = player.getPlayerState();
      const current = player.getCurrentTime();
      const now = Date.now();
      const steady = playerState === YT_STATE.PLAYING || playerState === YT_STATE.PAUSED;
      if (now < echoUntilRef.current) {
        steadyRef.current = null;
        return;
      }

      const base = steadyRef.current;
      if (steady)
        steadyRef.current = { time: current, at: now, playing: playerState === YT_STATE.PLAYING };
      if (base && steady) {
        const maxAdvance = base.playing ? (now - base.at) / 1000 : 0;
        if (current < base.time - SEEK_JUMP_S || current > base.time + maxAdvance + SEEK_JUMP_S) {
          onUpdateRef.current(playerState === YT_STATE.PLAYING, current);
          return;
        }
      }

      const target = expectedPosition(s);
      const offBy = Math.abs(current - target);
      const drifted =
        (s.playing && playerState === YT_STATE.PLAYING && offBy > DRIFT_TOLERANCE_S) ||
        (!s.playing && playerState === YT_STATE.PAUSED && offBy > DRIFT_TOLERANCE_S);
      if (drifted) {
        echoUntilRef.current = now + ECHO_WINDOW_MS;
        steadyRef.current = null;
        player.seekTo(target, true);
      }
    }, TICK_MS);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className={compact ? css.playerCompact : css.player}>
      <div ref={hostRef} className={css.playerHost} />
      {failed && (
        <div className={css.playerError}>
          {failed === 'bridge'
            ? t('call.watchTogether.playerUnavailable')
            : t('call.watchTogether.unavailable')}
        </div>
      )}
      {!compact && (
        <>
          <span className={css.playerLabel}>
            <YoutubeLogoIcon size={14} weight="fill" />
            {t('call.watchTogether.startedBy', { name: startedByName })}
          </span>
          <div className={css.playerBar}>
            <span className={css.playerButtons}>
              {onFocus && (
                <Tooltip content={t('call.watchTogether.focus')}>
                  <button
                    type="button"
                    className={css.playerButton}
                    onClick={onFocus}
                    aria-label={t('call.watchTogether.focus')}
                  >
                    <ArrowsOutSimpleIcon size={14} />
                  </button>
                </Tooltip>
              )}
              <Tooltip content={t('call.watchTogether.openOnYouTube')}>
                <a
                  className={css.playerButton}
                  href={youtubeWatchUrl(state.videoId)}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={t('call.watchTogether.openOnYouTube')}
                  onClick={(e) => {
                    const current = playerRef.current?.getCurrentTime() ?? expectedPosition(state);
                    e.currentTarget.href = youtubeWatchUrl(state.videoId, current);
                  }}
                >
                  <ArrowSquareOutIcon size={14} />
                </a>
              </Tooltip>
              <Tooltip content={t('call.watchTogether.stopWatching')}>
                <button
                  type="button"
                  className={css.playerButton}
                  onClick={() => setWatching(null)}
                  aria-label={t('call.watchTogether.stopWatching')}
                >
                  <EyeSlashIcon size={14} />
                </button>
              </Tooltip>
              <Tooltip content={t('call.watchTogether.stop')}>
                <button
                  type="button"
                  className={css.playerStop}
                  onClick={onStop}
                  aria-label={t('call.watchTogether.stop')}
                >
                  <XIcon size={14} weight="bold" />
                </button>
              </Tooltip>
            </span>
          </div>
        </>
      )}
    </div>
  );
}
