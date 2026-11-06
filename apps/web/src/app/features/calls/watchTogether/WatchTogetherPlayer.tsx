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
import { getMatrixClientOrNull } from '@/client/initMatrix';
import { useProfile } from '@/app/data';
import {
  expectedPosition,
  watchingVideoIdAtom,
  youtubeWatchUrl,
  type WatchPatch,
  type WatchState,
} from './watchTogether';
import { YT_STATE, createYouTubePlayer, type YTPlayer } from './youtube';
import * as css from './WatchTogether.css';

const DRIFT_TOLERANCE_S = 1.5;
const SEEK_JUMP_S = 1.5;
const ECHO_WINDOW_MS = 1500;
const TICK_MS = 500;
// Within this the player is in step with the room; further out (up to NUDGE_MAX_S) it catches up by
// playing a little faster or slower, which is smoother than a seek; beyond that it seeks.
const IN_SYNC_S = 0.3;
const NUDGE_MAX_S = 3;
const NUDGE_FACTOR = 0.25;
// Buffering for this long pauses the room for that person until they have enough video ahead.
const BUFFER_WAIT_MS = 2000;
const BUFFER_AHEAD_S = 4;
// After holding or releasing the room, wait this long before doing either again.
const HOLD_COOLDOWN_MS = 8000;
// A change in the video's length with no new video means an advert has started or ended.
const DURATION_JUMP_S = 2;
// Just after an advert the player moves by itself, so for a moment nothing it does counts as this
// person pressing play, pause or seek.
const QUIET_MS = 1500;

interface Sample {
  time: number;
  at: number;
  playing: boolean;
  duration: number;
}

function setRate(player: YTPlayer, requested: { current: number }, rate: number) {
  if (requested.current === rate) return;
  requested.current = rate;
  player.setPlaybackRate(rate);
}

interface Props {
  state: WatchState;
  startedByName: string;
  compact?: boolean;
  onUpdate: (patch: WatchPatch) => void;
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
  const myIdRef = useRef(getMatrixClientOrNull()?.userId() ?? '');
  // Whether this player has played yet; the clock is only re-anchored for a video's first play.
  const hasPlayedRef = useRef(false);
  const inAdvertRef = useRef(false);
  // The rate this player was last told to play at, to tell its own changes from someone using the
  // speed menu in the player
  const requestedRateRef = useRef(1);
  const bufferingSinceRef = useRef<number | null>(null);
  const holdCooldownUntilRef = useRef(0);
  const quietUntilRef = useRef(0);
  const [failed, setFailed] = useState<'video' | 'bridge' | null>(null);
  const setWatching = useSetAtom(watchingVideoIdAtom);

  // Whether a pause, play or seek in the player was this person's doing. The player is in a frame
  // we cannot hear clicks from, but the pointer being over it, or it holding the keyboard, says so.
  const userInPlayer = useCallback(() => {
    const host = hostRef.current;
    if (!host || Date.now() < quietUntilRef.current) return false;
    const doc = host.ownerDocument;
    return host.matches(':hover') || (doc.hasFocus() && host.contains(doc.activeElement));
  }, []);

  const apply = useCallback((s: WatchState) => {
    const player = playerRef.current;
    // An advert can be neither paused nor moved; once it ends the tick comes back here
    if (!player || !readyRef.current || player.isAdvert()) return;
    echoUntilRef.current = Date.now() + ECHO_WINDOW_MS;
    const target = expectedPosition(s);
    const currentId = player.getVideoData?.().video_id;
    if (currentId && currentId !== s.videoId) {
      steadyRef.current = null;
      if (s.playing) player.loadVideoById({ videoId: s.videoId, startSeconds: target });
      else player.cueVideoById({ videoId: s.videoId, startSeconds: target });
      return;
    }
    // The person who started the video re-anchors the clock when it first plays (see
    // handlePlayerState), so until then the loading time is not drift to seek over.
    const awaitingFirstPlay = !hasPlayedRef.current && s.playing && s.startedBy === myIdRef.current;
    if (!awaitingFirstPlay && Math.abs(player.getCurrentTime() - target) > DRIFT_TOLERANCE_S) {
      steadyRef.current = null;
      player.seekTo(target, true);
    }
    const playerState = player.getPlayerState();
    const running = playerState === YT_STATE.PLAYING || playerState === YT_STATE.BUFFERING;
    if (s.playing && !running) player.playVideo();
    if (!s.playing && running) player.pauseVideo();
    setRate(player, requestedRateRef, s.rate);
  }, []);

  const handlePlayerState = useCallback(
    (playerState: number) => {
      const player = playerRef.current;
      const s = stateRef.current;
      const previous = lastPlayerStateRef.current;
      lastPlayerStateRef.current = playerState;
      if (!player || !s) return;
      // What an advert does says nothing about the room; the tick catches the player up when it ends
      if (player.isAdvert()) return;
      // Buffering is not the person doing anything, but how long it lasts is watched (see the tick)
      if (playerState === YT_STATE.BUFFERING) {
        bufferingSinceRef.current ??= Date.now();
        return;
      }
      bufferingSinceRef.current = null;
      const current = player.getCurrentTime();
      const isEcho = Date.now() < echoUntilRef.current;

      if (playerState === YT_STATE.PLAYING) {
        hasPlayedRef.current = true;
        const firstStart = previous === YT_STATE.UNSTARTED || previous === YT_STATE.CUED;
        if (firstStart && Math.abs(current - expectedPosition(s)) > DRIFT_TOLERANCE_S) {
          // The shared clock started when the video was started, but the player needed a few seconds to
          // load. For the person who started it, the picture began at the start, so move the clock to
          // now instead of skipping the video ahead by however long loading took.
          if (s.playing && s.startedBy === myIdRef.current && current < DRIFT_TOLERANCE_S) {
            steadyRef.current = null;
            onUpdateRef.current({ playing: true, position: current });
            return;
          }
          echoUntilRef.current = Date.now() + ECHO_WINDOW_MS;
          steadyRef.current = null;
          player.seekTo(expectedPosition(s), true);
          if (!s.playing) player.pauseVideo();
          return;
        }
        if (!isEcho && !s.playing) {
          if (userInPlayer()) {
            onUpdateRef.current({ playing: true, position: current });
          } else {
            // It started itself (an advert ended, or the video loaded): the room is paused, so stay so
            echoUntilRef.current = Date.now() + ECHO_WINDOW_MS;
            player.pauseVideo();
          }
        }
      } else if (playerState === YT_STATE.PAUSED) {
        if (!isEcho && s.playing) {
          if (userInPlayer()) {
            onUpdateRef.current({ playing: false, position: current });
          } else {
            echoUntilRef.current = Date.now() + ECHO_WINDOW_MS;
            player.playVideo();
          }
        }
      } else if (playerState === YT_STATE.ENDED) {
        // Only the video really finishing ends it for everyone, not an advert that ends
        const duration = player.getDuration();
        if (s.playing && duration > 0 && expectedPosition(s) >= duration - 5) {
          onUpdateRef.current({ playing: false, position: duration });
        }
      }
    },
    [userInPlayer]
  );

  // Someone using the player's own speed menu changes it for the room; this player's own nudges
  // (which also report back) and what an advert does do not.
  const handleRateChange = useCallback(
    (rate: number) => {
      const s = stateRef.current;
      const player = playerRef.current;
      if (!s || !player || player.isAdvert()) return;
      if (rate === requestedRateRef.current || requestedRateRef.current !== s.rate) return;
      requestedRateRef.current = rate;
      if (userInPlayer()) {
        onUpdateRef.current({ rate, position: player.getCurrentTime() });
      } else {
        setRate(player, requestedRateRef, s.rate);
      }
    },
    [userInPlayer]
  );

  useEffect(() => {
    let cancelled = false;
    const host = hostRef.current;
    if (host) {
      const initial = stateRef.current;
      // A video this person has just started begins at its beginning; for anyone else the clock has
      // moved on while the player loaded, so it starts where the clock is when it is told what to play.
      const justStarted = initial.startedBy === myIdRef.current && expectedPosition(initial) < 2;
      const startAt = expectedPosition(initial);
      playerRef.current = createYouTubePlayer(host, {
        videoId: initial.videoId,
        autoplay: initial.playing,
        start: () => (justStarted ? startAt : expectedPosition(stateRef.current)),
        onReady: () => {
          readyRef.current = true;
          apply(stateRef.current);
        },
        onStateChange: handlePlayerState,
        onRateChange: handleRateChange,
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
  }, [apply, handlePlayerState, handleRateChange]);

  useEffect(() => apply(state), [state, apply]);

  // Closing the player while the room waits for it would leave everyone waiting
  useEffect(
    () => () => {
      if (stateRef.current.waitingFor === myIdRef.current) {
        onUpdateRef.current({ playing: true, waitingFor: null });
      }
    },
    []
  );

  useEffect(() => setFailed((kind) => (kind === 'video' ? null : kind)), [state.videoId]);

  useEffect(() => {
    const timer = setInterval(() => {
      const player = playerRef.current;
      const s = stateRef.current;
      if (!player || !readyRef.current) return;
      const playerState = player.getPlayerState();
      const current = player.getCurrentTime();
      const duration = player.getDuration();
      const now = Date.now();
      const steady = playerState === YT_STATE.PLAYING || playerState === YT_STATE.PAUSED;

      // An advert: nothing to follow or to say. Afterwards the video resumes where it left off, which
      // is behind the room, so bring it back to where the room is.
      if (player.isAdvert()) {
        inAdvertRef.current = true;
        steadyRef.current = null;
        bufferingSinceRef.current = null;
        return;
      }
      if (inAdvertRef.current) {
        inAdvertRef.current = false;
        steadyRef.current = null;
        quietUntilRef.current = now + QUIET_MS;
        apply(s);
        return;
      }

      // Stuck buffering: pause the room until this player has caught up, so nobody misses a part
      // that this person is still waiting for.
      const bufferingFor = bufferingSinceRef.current ? now - bufferingSinceRef.current : 0;
      if (
        s.playing &&
        !s.waitingFor &&
        bufferingFor > BUFFER_WAIT_MS &&
        now > holdCooldownUntilRef.current
      ) {
        holdCooldownUntilRef.current = now + HOLD_COOLDOWN_MS;
        onUpdateRef.current({ playing: false, position: current, waitingFor: myIdRef.current });
        return;
      }
      if (!s.playing && s.waitingFor === myIdRef.current && playerState !== YT_STATE.BUFFERING) {
        const loaded = player.getLoadedFraction();
        const ready =
          loaded === null ||
          duration <= 0 ||
          loaded >= 0.99 ||
          loaded * duration >= s.position + BUFFER_AHEAD_S;
        if (ready) {
          holdCooldownUntilRef.current = now + HOLD_COOLDOWN_MS;
          onUpdateRef.current({ playing: true, position: s.position, waitingFor: null });
        }
        return;
      }

      if (now < echoUntilRef.current) {
        steadyRef.current = null;
        return;
      }

      const base = steadyRef.current;
      // A player that does not say when it is showing an advert still gives it away: the length of
      // what it is playing changes.
      if (base && steady && Math.abs(duration - base.duration) > DURATION_JUMP_S) {
        steadyRef.current = null;
        quietUntilRef.current = now + QUIET_MS;
        apply(s);
        return;
      }
      if (steady) {
        steadyRef.current = {
          time: current,
          at: now,
          playing: playerState === YT_STATE.PLAYING,
          duration,
        };
      }
      if (base && steady) {
        const maxAdvance = base.playing ? ((now - base.at) / 1000) * player.getPlaybackRate() : 0;
        if (current < base.time - SEEK_JUMP_S || current > base.time + maxAdvance + SEEK_JUMP_S) {
          if (userInPlayer()) {
            onUpdateRef.current({ playing: playerState === YT_STATE.PLAYING, position: current });
          } else {
            // Not this person's doing (the player lost its place), so it is put right, not shared
            echoUntilRef.current = now + ECHO_WINDOW_MS;
            steadyRef.current = null;
            player.seekTo(expectedPosition(s), true);
          }
          return;
        }
      }

      // A pause the room has made that the player did not take (an advert was in the way)
      if (!s.playing && playerState === YT_STATE.PLAYING && !userInPlayer()) {
        echoUntilRef.current = now + ECHO_WINDOW_MS;
        player.pauseVideo();
        return;
      }

      const target = expectedPosition(s);
      const offBy = current - target;
      if (s.playing && playerState === YT_STATE.PLAYING) {
        // Where the page cannot report its rate there is no telling what a nudge did, so seek
        const canNudge = player.supportsRate() && s.rate === 1;
        const farOff = Math.abs(offBy) > (canNudge ? NUDGE_MAX_S : DRIFT_TOLERANCE_S);
        if (Math.abs(offBy) <= IN_SYNC_S) {
          setRate(player, requestedRateRef, s.rate);
        } else if (canNudge && !farOff) {
          setRate(player, requestedRateRef, offBy < 0 ? 1 + NUDGE_FACTOR : 1 - NUDGE_FACTOR);
        } else if (farOff) {
          setRate(player, requestedRateRef, s.rate);
          echoUntilRef.current = now + ECHO_WINDOW_MS;
          steadyRef.current = null;
          player.seekTo(target, true);
        }
      } else if (
        !s.playing &&
        playerState === YT_STATE.PAUSED &&
        Math.abs(offBy) > DRIFT_TOLERANCE_S
      ) {
        echoUntilRef.current = now + ECHO_WINDOW_MS;
        steadyRef.current = null;
        player.seekTo(target, true);
      }
    }, TICK_MS);
    return () => clearInterval(timer);
  }, [apply, userInPlayer]);

  const waitingFor =
    state.waitingFor && state.waitingFor !== myIdRef.current ? state.waitingFor : null;
  const { data: waitingProfile } = useProfile(waitingFor);
  const waitingName = waitingFor ? (waitingProfile?.displayName ?? waitingFor) : null;

  return (
    <div className={compact ? css.playerCompact : css.player}>
      <div ref={hostRef} className={css.playerHost} />
      {waitingName && !failed && (
        <div className={css.playerWaiting}>
          {t('call.watchTogether.waitingFor', { name: waitingName })}
        </div>
      )}
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
