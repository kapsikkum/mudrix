import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAtom, useAtomValue } from 'jotai';
import { useTranslation } from 'react-i18next';
import {
  ArrowsInIcon,
  ArrowsOutIcon,
  DotsThreeIcon,
  EyeIcon,
  EyeSlashIcon,
  HandIcon,
  MicrophoneSlashIcon,
  MonitorIcon,
  PhoneIcon,
} from '@phosphor-icons/react';
import type { CallParticipant, CallSession, MediaTrackHandle, RingState } from 'wizardchat-rtc';
import type { Room } from 'matrix-js-sdk';
import { Avatar, useAvatarBlobUrl } from '@/app/components/Avatar';
import { useBannerGradient } from '@/app/hooks/useBannerGradient';
import { Tooltip } from '@/app/components/Tooltip';
import {
  callEffectiveViewAtom,
  callUiAtom,
  callSessionAtom,
  callPanelAtom,
  showNonVideoParticipantsAtom,
  showOwnScreenShareAtom,
} from '@/app/store/atoms/call';
import { themeAtom } from '@/app/store/atoms/settings';
import { buildCallBackground } from '@/app/features/calls/callBackground';
import { formatUserId } from '@/util/matrix';
import { useCallSnapshot } from './useCallSnapshot';
import { StreamCallMenu, UserCallMenu, type UserMenuAnchor } from './UserCallMenu';
import { useDismiss } from './useDismiss';
import * as css from './CallStage.css';

function VideoTrack({
  track,
  mirror,
  contain,
}: {
  track: MediaTrackHandle;
  mirror: boolean;
  contain: boolean;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    track.attach(el);
    return () => {
      track.detach(el);
    };
  }, [track]);
  const className = [css.video, contain ? css.videoContain : '', mirror ? css.mirrored : '']
    .filter(Boolean)
    .join(' ');
  return <video ref={ref} className={className} autoPlay playsInline muted />;
}

interface StageTile {
  key: string;
  participant: CallParticipant;
  screen: boolean;
}

function UserBackdrop({ name, mxc, room }: { name: string; mxc: string | null; room: Room }) {
  const { data: avatarSrc } = useAvatarBlobUrl(mxc, room.client);
  const gradient = useBannerGradient(avatarSrc, name);
  return <span className={css.backdrop} style={{ backgroundImage: gradient }} />;
}

function useFullscreen(ref: React.RefObject<HTMLElement | null>): [boolean, () => void] {
  const [active, setActive] = useState(false);
  useEffect(() => {
    const update = () => setActive(!!ref.current && document.fullscreenElement === ref.current);
    document.addEventListener('fullscreenchange', update);
    return () => document.removeEventListener('fullscreenchange', update);
  }, [ref]);
  const toggle = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    if (document.fullscreenElement === el) void document.exitFullscreen();
    else void el.requestFullscreen().catch(() => {});
  }, [ref]);
  return [active, toggle];
}

function Tile({
  tile,
  room,
  focused,
  compact,
  onSelect,
  onMenu,
  onWatch,
}: {
  tile: StageTile;
  room: Room;
  focused?: boolean;
  compact?: boolean;
  onSelect?: () => void;
  onMenu?: (x: number, y: number) => void;
  onWatch?: () => void;
}) {
  const showOwnScreen = useAtomValue(showOwnScreenShareAtom);
  const { t } = useTranslation();
  const ref = useRef<HTMLDivElement>(null);
  const { participant, screen } = tile;
  const member = room.getMember(participant.userId);
  const name = member?.name ?? formatUserId(participant.userId);
  const mxc = member?.getMxcAvatarUrl() ?? null;
  const previewHidden = screen && participant.isLocal && !showOwnScreen;
  const unwatched = screen && !participant.watchingScreen;
  const track = screen ? participant.screenTrack : participant.cameraTrack;
  const speaking = !screen && participant.speaking;
  const videoHidden = !screen && participant.cameraHidden;
  const canFullscreen = !!track && !previewHidden && !unwatched;
  const [isFullscreen, toggleFullscreen] = useFullscreen(ref);
  const fullscreenLabel = isFullscreen ? t('call.exitFullscreen') : t('call.fullscreen');

  const classes = [
    css.tile,
    screen ? css.tileScreen : '',
    speaking ? css.tileSpeaking : '',
    focused ? css.tileFocused : '',
    onSelect ? css.tileClickable : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      ref={ref}
      className={classes}
      onClick={onSelect ? (e) => e.detail < 2 && onSelect() : undefined}
      onDoubleClick={canFullscreen ? toggleFullscreen : undefined}
      role={onSelect ? 'button' : undefined}
      tabIndex={onSelect ? 0 : undefined}
      onKeyDown={(e) => {
        if (onSelect && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          onSelect();
        }
      }}
      onContextMenu={
        onMenu
          ? (e) => {
              e.preventDefault();
              onMenu(e.clientX, e.clientY);
            }
          : undefined
      }
    >
      {(!screen || unwatched) && <UserBackdrop name={name} mxc={mxc} room={room} />}
      {unwatched ? (
        <span className={css.watchOverlay}>
          {onWatch && (
            <button
              type="button"
              className={css.watchBtn}
              onClick={(e) => {
                e.stopPropagation();
                onWatch();
              }}
            >
              <EyeIcon size={16} weight="bold" />
              {t('call.watchStream')}
            </button>
          )}
        </span>
      ) : previewHidden ? (
        <span className={css.previewHidden}>{t('call.ownScreenHidden')}</span>
      ) : track ? (
        <VideoTrack track={track} mirror={participant.isLocal && !screen} contain={screen} />
      ) : (
        !screen && (
          <span className={css.avatar}>
            <Avatar
              name={name}
              mxcUrl={mxc}
              client={room.client}
              size={compact ? 'lg' : 'xl'}
              placeholder="logo"
            />
          </span>
        )
      )}
      {screen && <span className={css.liveBadge}>{t('call.live')}</span>}
      {!screen && participant.handRaised && (
        <span className={css.badge} title={t('call.handRaised')}>
          ✋
        </span>
      )}
      {!screen && participant.reaction && (
        <span key={participant.reaction} className={css.reaction}>
          {participant.reaction}
        </span>
      )}
      {videoHidden && (
        <Tooltip content={t('call.videoHiddenForYou')}>
          <span className={css.videoHiddenBadge} aria-label={t('call.videoHiddenForYou')}>
            <EyeSlashIcon size={16} weight="bold" />
          </span>
        </Tooltip>
      )}
      {canFullscreen && (
        <Tooltip content={fullscreenLabel}>
          <button
            type="button"
            className={videoHidden ? css.tileFullscreenBtnShifted : css.tileFullscreenBtn}
            aria-label={fullscreenLabel}
            onClick={(e) => {
              e.stopPropagation();
              toggleFullscreen();
            }}
          >
            {isFullscreen ? (
              <ArrowsInIcon size={16} weight="bold" />
            ) : (
              <ArrowsOutIcon size={16} weight="bold" />
            )}
          </button>
        </Tooltip>
      )}
      {onMenu && (
        <button
          type="button"
          className={videoHidden ? css.tileMenuBtnShifted : css.tileMenuBtn}
          aria-label={t('common.more')}
          aria-haspopup="menu"
          onClick={(e) => {
            e.stopPropagation();
            const rect = e.currentTarget.getBoundingClientRect();
            onMenu(rect.right, rect.bottom + 4);
          }}
        >
          <DotsThreeIcon size={18} weight="bold" />
        </button>
      )}
      <span className={css.label}>
        {screen && <MonitorIcon size={13} weight="fill" />}
        {!screen && participant.audioMuted && (
          <MicrophoneSlashIcon size={13} weight="fill" className={css.mutedIcon} />
        )}
        <span className={css.labelName}>
          {participant.isLocal && !screen ? t('call.you', { name }) : name}
        </span>
      </span>
    </div>
  );
}

function AvatarBubble({
  participant,
  room,
  onMenu,
}: {
  participant: CallParticipant;
  room: Room;
  onMenu: (x: number, y: number) => void;
}) {
  const { t } = useTranslation();
  const member = room.getMember(participant.userId);
  const name = member?.name ?? formatUserId(participant.userId);
  return (
    <div
      className={css.bubble}
      title={participant.isLocal ? t('call.you', { name }) : name}
      onContextMenu={(e) => {
        e.preventDefault();
        onMenu(e.clientX, e.clientY);
      }}
    >
      <span className={participant.speaking ? css.bubbleRingSpeaking : css.bubbleRing}>
        <Avatar
          name={name}
          mxcUrl={member?.getMxcAvatarUrl() ?? null}
          client={room.client}
          size="fill"
          placeholder="logo"
        />
      </span>
      {participant.audioMuted && (
        <span className={css.bubbleMuted} aria-label={t('voice.mute')}>
          <MicrophoneSlashIcon size={14} weight="fill" />
        </span>
      )}
      {participant.handRaised && (
        <span className={css.bubbleHand} title={t('call.handRaised')}>
          ✋
        </span>
      )}
      {participant.reaction && (
        <span key={participant.reaction} className={css.bubbleReaction}>
          {participant.reaction}
        </span>
      )}
    </div>
  );
}

function CallingView({
  room,
  ring,
  compact,
  onRingAgain,
}: {
  room: Room;
  ring: RingState;
  compact: boolean;
  onRingAgain: () => void;
}) {
  const { t } = useTranslation();
  const myId = room.client.getUserId();
  const self = myId ? room.getMember(myId) : null;
  const target = room
    .getMembers()
    .find((m) => m.userId !== myId && (m.membership === 'join' || m.membership === 'invite'));
  const targetName = target?.name ?? '';
  const bubble = (member: typeof self, pulsing: boolean) => (
    <span
      className={[css.bubbleRing, compact ? css.bubbleRingSmall : '', pulsing ? css.ringPulse : '']
        .filter(Boolean)
        .join(' ')}
    >
      <Avatar
        name={member?.name ?? ''}
        mxcUrl={member?.getMxcAvatarUrl() ?? null}
        client={room.client}
        size="fill"
        placeholder="logo"
      />
    </span>
  );
  const status =
    ring === 'ringing'
      ? t('call.calling', { name: targetName })
      : ring === 'declined'
        ? t('call.declined', { name: targetName })
        : t('call.noAnswer');

  return (
    <div className={css.calling}>
      <div className={css.callingRow}>
        {!compact && bubble(self, false)}
        {target && bubble(target, ring === 'ringing')}
      </div>
      <span className={css.callingStatus} aria-live="polite">
        {status}
      </span>
      {ring !== 'ringing' && !compact && (
        <button type="button" className={css.watchBtn} onClick={onRingAgain}>
          <PhoneIcon size={16} weight="bold" />
          {t('call.ringAgain')}
        </button>
      )}
    </div>
  );
}

const TILE_ASPECT = 16 / 9;
const GRID_GAP = 8;

function useGridLayout(count: number) {
  const [element, setElement] = useState<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      setSize({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [element]);

  let best = { columns: 1, width: 0 };
  for (let columns = 1; columns <= Math.max(count, 1); columns++) {
    const rows = Math.ceil(count / columns);
    const byWidth = (size.width - GRID_GAP * (columns - 1)) / columns;
    const byHeight = ((size.height - GRID_GAP * (rows - 1)) / rows) * TILE_ASPECT;
    const width = Math.floor(Math.min(byWidth, byHeight));
    if (width > best.width) best = { columns, width };
  }
  return { ref: setElement, columns: best.columns, tileWidth: Math.max(best.width, 0) };
}

const REACTIONS: { emoji: string; name: string }[] = [
  { emoji: '👍', name: 'thumbsup' },
  { emoji: '👏', name: 'clap' },
  { emoji: '😂', name: 'laugh' },
  { emoji: '❤️', name: 'heart' },
  { emoji: '🎉', name: 'party' },
  { emoji: '😮', name: 'surprised' },
  { emoji: '🤔', name: 'thinking' },
  { emoji: '👎', name: 'thumbsdown' },
];

function ReactionsPanel({
  session,
  handRaised,
  onClose,
}: {
  session: CallSession;
  handRaised: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDivElement>(null);
  useDismiss(ref, onClose);
  const handLabel = handRaised ? t('call.lowerHand') : t('call.raiseHand');
  return (
    <div ref={ref} className={css.panel}>
      <div className={css.reactionRow}>
        <Tooltip content={handLabel}>
          <button
            type="button"
            className={handRaised ? css.handBtnActive : css.handBtn}
            aria-pressed={handRaised}
            aria-label={handLabel}
            onClick={() => void session.setHandRaised(!handRaised)}
          >
            <HandIcon size={20} weight={handRaised ? 'fill' : 'regular'} />
          </button>
        </Tooltip>
        <span className={css.reactionDivider} aria-hidden />
        {REACTIONS.map((r) => (
          <button
            key={r.name}
            type="button"
            className={css.reactionBtn}
            aria-label={r.name}
            onClick={() => void session.sendReaction(r.emoji, r.name)}
          >
            {r.emoji}
          </button>
        ))}
      </div>
    </div>
  );
}

export function CallStage() {
  const { t } = useTranslation();
  const session = useAtomValue(callSessionAtom);
  const snapshot = useCallSnapshot();
  const [ui, setUi] = useAtom(callUiAtom);
  const view = useAtomValue(callEffectiveViewAtom);
  const theme = useAtomValue(themeAtom);
  const [panel, setPanel] = useAtom(callPanelAtom);
  const [focusedKey, setFocusedKey] = useState<string | null>(null);
  const [userMenu, setUserMenu] = useState<UserMenuAnchor | null>(null);
  const closePanel = useCallback(() => setPanel(null), [setPanel]);
  const closeUserMenu = useCallback(() => setUserMenu(null), []);
  const room = session?.matrixRoom;
  const background = buildCallBackground(theme);

  const [showNonVideo, setShowNonVideo] = useAtom(showNonVideoParticipantsAtom);
  const hasVideo = !!snapshot?.participants.some((p) => p.cameraTrack || p.screenShared);
  useEffect(() => {
    if (!hasVideo && !showNonVideo) setShowNonVideo(true);
  }, [hasVideo, showNonVideo, setShowNonVideo]);
  const tiles = useMemo<StageTile[]>(() => {
    const list: StageTile[] = [];
    for (const p of snapshot?.participants ?? []) {
      if (showNonVideo || p.cameraTrack) list.push({ key: p.id, participant: p, screen: false });
    }
    for (const p of snapshot?.participants ?? []) {
      if (p.screenShared) list.push({ key: `${p.id}:screen`, participant: p, screen: true });
    }
    return list;
  }, [snapshot, showNonVideo]);

  const compact = view === 'tile';
  const docked = view === 'docked';
  const stageView = compact || ui.isSpotlight;
  const grid = useGridLayout(tiles.length);

  const focused =
    tiles.find((tile) => tile.key === focusedKey) ??
    tiles.find((tile) => tile.screen) ??
    tiles.find((tile) => tile.participant.speaking && !tile.participant.isLocal) ??
    tiles.find((tile) => !tile.participant.isLocal) ??
    tiles[0];

  if (!session || !snapshot || !room) return null;
  const own = snapshot.participants.find((p) => p.isLocal);
  const style = { backgroundColor: background.base, backgroundImage: background.glow };

  const select = (key: string) => {
    if (stageView && focused?.key === key) {
      setFocusedKey(null);
      setUi((prev) => ({ ...prev, isSpotlight: false }));
    } else {
      setFocusedKey(key);
      setUi((prev) => ({ ...prev, isSpotlight: true }));
    }
  };

  const watchFor = (tile: StageTile) =>
    tile.screen && !tile.participant.watchingScreen
      ? () => {
          session.setWatchingStream(tile.participant.id, true);
          setFocusedKey(tile.key);
          setUi((prev) => ({ ...prev, isSpotlight: true }));
        }
      : undefined;

  const openMenu = (tile: StageTile) => (x: number, y: number) =>
    setUserMenu({
      userId: tile.participant.userId,
      screen: tile.screen,
      local: tile.participant.isLocal,
      participantId: tile.participant.id,
      x,
      y,
    });

  const myId = room.client.getUserId();
  const alone = !snapshot.participants.some((p) => p.userId !== myId);

  let content: React.ReactNode;
  if (snapshot.ring && alone) {
    content = (
      <CallingView
        room={room}
        ring={snapshot.ring}
        compact={compact}
        onRingAgain={() => void session.ringAgain()}
      />
    );
  } else if (tiles.length === 0 || !focused) {
    content = <span className={css.empty}>{t('voice.statusConnecting')}</span>;
  } else if (docked) {
    content = (
      <div className={css.dockedRow}>
        {snapshot.participants.map((p) => {
          const tile: StageTile = { key: p.id, participant: p, screen: false };
          return p.cameraTrack ? (
            <div key={tile.key} className={css.dockedVideo}>
              <Tile
                onWatch={watchFor(tile)}
                tile={tile}
                room={room}
                compact
                onMenu={openMenu(tile)}
              />
            </div>
          ) : (
            <AvatarBubble key={tile.key} participant={p} room={room} onMenu={openMenu(tile)} />
          );
        })}
        {tiles
          .filter((tile) => tile.screen)
          .map((tile) => (
            <div key={tile.key} className={css.dockedVideo}>
              <Tile
                onWatch={watchFor(tile)}
                tile={tile}
                room={room}
                compact
                onMenu={openMenu(tile)}
              />
            </div>
          ))}
      </div>
    );
  } else if (stageView) {
    const others = tiles.filter((tile) => tile.key !== focused.key);
    content = (
      <>
        <div className={css.stageMain}>
          <div className={!compact && others.length > 0 ? css.stageFocusWithStrip : css.stageFocus}>
            <Tile
              key={focused.key}
              tile={focused}
              room={room}
              onWatch={watchFor(focused)}
              focused
              compact={compact}
              onSelect={compact ? undefined : () => select(focused.key)}
              onMenu={compact ? undefined : openMenu(focused)}
            />
          </div>
        </div>
        {!compact && others.length > 0 && (
          <div className={css.strip}>
            {others.map((tile) => (
              <div key={tile.key} className={css.stripItem}>
                <Tile
                  tile={tile}
                  room={room}
                  compact
                  onSelect={() => select(tile.key)}
                  onWatch={watchFor(tile)}
                  onMenu={openMenu(tile)}
                />
              </div>
            ))}
          </div>
        )}
      </>
    );
  } else {
    content = (
      <div
        className={css.grid}
        style={{
          maxWidth: grid.columns * grid.tileWidth + GRID_GAP * (grid.columns - 1),
        }}
      >
        {tiles.map((tile) => (
          <div key={tile.key} className={css.gridItem} style={{ width: grid.tileWidth }}>
            <Tile
              tile={tile}
              room={room}
              onSelect={() => select(tile.key)}
              onMenu={openMenu(tile)}
              onWatch={watchFor(tile)}
            />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className={compact ? css.stageCompact : css.stage} style={style}>
      <div ref={grid.ref} className={css.area}>
        {content}
      </div>
      {!compact && panel === 'reactions' && (
        <ReactionsPanel session={session} handRaised={!!own?.handRaised} onClose={closePanel} />
      )}
      {userMenu?.screen && (
        <StreamCallMenu
          anchor={userMenu}
          room={room}
          isSelf={!!userMenu.local}
          onClose={closeUserMenu}
        />
      )}
      {userMenu && !userMenu.screen && (
        <UserCallMenu
          anchor={userMenu}
          room={room}
          isSelf={userMenu.userId === room.client.getUserId()}
          onClose={closeUserMenu}
        />
      )}
    </div>
  );
}
