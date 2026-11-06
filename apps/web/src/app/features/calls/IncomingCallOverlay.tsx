import { useCallback, useRef, useState } from 'react';
import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { PhoneIcon, PhoneXIcon, VideoCameraIcon } from '@phosphor-icons/react';
import { Avatar } from '@/app/components/Avatar';
import { Tooltip } from '@/app/components/Tooltip';
import type { WizardClient } from '@wizardchat/core';
import { useProfile } from '@/app/data';
import { STORAGE_KEY_CALL_INCOMING_POSITION } from '@/const/storageKeys';
import * as css from './IncomingCallOverlay.css';

const EDGE = 8;

interface Position {
  x: number;
  y: number;
}

/** Keep the whole card on screen, e.g. after the window shrank since it was placed. */
function clampToViewport(pos: Position, el: HTMLElement | null): Position {
  const w = el?.offsetWidth ?? 300;
  const h = el?.offsetHeight ?? 80;
  return {
    x: Math.min(Math.max(EDGE, pos.x), Math.max(EDGE, window.innerWidth - w - EDGE)),
    y: Math.min(Math.max(EDGE, pos.y), Math.max(EDGE, window.innerHeight - h - EDGE)),
  };
}

function loadPosition(): Position | null {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY_CALL_INCOMING_POSITION) ?? 'null');
    return raw && typeof raw.x === 'number' && typeof raw.y === 'number' ? raw : null;
  } catch {
    return null;
  }
}

function savePosition(pos: Position): void {
  try {
    localStorage.setItem(STORAGE_KEY_CALL_INCOMING_POSITION, JSON.stringify(pos));
  } catch {
    // storage unavailable: it just opens in the corner next time
  }
}

interface Props {
  callerName: string;
  callerId: string;
  voiceOnly: boolean;
  client: WizardClient;
  onAccept: () => void;
  onDecline: () => void;
}

export function IncomingCallOverlay({
  callerName,
  callerId,
  voiceOnly,
  client,
  onAccept,
  onDecline,
}: Props) {
  const { t } = useTranslation();
  const avatarMxc = useProfile(callerId).data?.avatarUrl ?? null;
  const CallIcon = voiceOnly ? PhoneIcon : VideoCameraIcon;
  const kind = voiceOnly ? t('voice.incomingVoiceCall') : t('voice.incomingVideoCall');

  // Opens in the corner; it can be dragged out of the way and remembers where it was left.
  const ref = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<Position | null>(() => {
    const saved = loadPosition();
    return saved ? clampToViewport(saved, null) : null;
  });
  const drag = useRef<{ dx: number; dy: number; id: number } | null>(null);

  const onPointerDown = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!el || e.button !== 0) return;
    if ((e.target as Element).closest('button')) return;
    const rect = el.getBoundingClientRect();
    drag.current = { dx: e.clientX - rect.left, dy: e.clientY - rect.top, id: e.pointerId };
    el.setPointerCapture(e.pointerId);
    el.style.cursor = 'grabbing';
  }, []);

  const onPointerMove = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    setPosition(clampToViewport({ x: e.clientX - d.dx, y: e.clientY - d.dy }, ref.current));
  }, []);

  const onPointerUp = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      const d = drag.current;
      if (!d || d.id !== e.pointerId) return;
      drag.current = null;
      if (ref.current) ref.current.style.cursor = '';
      if (position) savePosition(position);
    },
    [position]
  );

  const placed: CSSProperties | undefined = position
    ? { left: position.x, top: position.y, right: 'auto', bottom: 'auto' }
    : undefined;

  return (
    <div
      ref={ref}
      style={placed}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      className={css.overlay}
      role="alertdialog"
      aria-label={`${kind}: ${callerName}`}
    >
      <span className={css.avatarRing}>
        <Avatar name={callerName} mxcUrl={avatarMxc} client={client} size="md" placeholder="logo" />
      </span>
      <div className={css.callerInfo}>
        <span className={css.callerName}>{callerName}</span>
        <span className={css.callKind}>
          <CallIcon size={12} weight="fill" />
          {kind}
        </span>
      </div>
      <Tooltip content={t('voice.declineShort')}>
        <button
          type="button"
          className={css.declineBtn}
          onClick={onDecline}
          aria-label={t('voice.declineShort')}
        >
          <PhoneXIcon size={18} weight="fill" />
        </button>
      </Tooltip>
      <Tooltip content={t('voice.acceptShort')}>
        <button
          type="button"
          className={css.acceptBtn}
          onClick={onAccept}
          aria-label={t('voice.acceptShort')}
        >
          <CallIcon size={18} weight="fill" />
        </button>
      </Tooltip>
    </div>
  );
}
