import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAtomValue, useSetAtom } from 'jotai';
import type { WizardClient } from '@wizardchat/core';
import { useTranslation } from 'react-i18next';
import { CaretDownIcon, SpeakerHighIcon } from '@phosphor-icons/react';
import {
  callActionsAtom,
  callDedicatedScreenAtom,
  callEffectiveViewAtom,
  callIsVoiceRoomAtom,
  callPopoutOpenAtom,
  callUiAtom,
  callSessionAtom,
} from '@/app/store/atoms/call';
import type { CallPresentation, CallView } from '@/app/store/atoms/call';
import { useRoom } from '@/app/data';
import { useCallContainer } from '@/app/features/calls/CallContainer';
import { useIncomingCall } from './useIncomingCall';
import { useSoundboardReceiver } from '@/app/features/soundboard/useSoundboardReceiver';
import { IncomingCallOverlay } from './IncomingCallOverlay';
import { CallControlBar } from './CallControlBar';
import { CallReactionsRail } from './CallReactionsRail';
import { ScreenShareNotice } from './ScreenShareNotice';
import { CallStage } from './stage/CallStage';
import { CallPopoutWindow, CallWindowProvider, callPopoutRootAtom } from './CallPopoutWindow';
import * as css from './CallLayer.css';
import { DOCKED_HEADER_HEIGHT } from './CallLayer.css';

interface Props {
  client: WizardClient | null;
}

const DEFAULT_DOCKED_HEIGHT = 360;
const RATIO_W_TO_H = 16 / 9;
const MIN_DOCKED_HEIGHT = 280;
const MAX_DOCKED_HEIGHT_FRACTION = 0.5;

const SNAP_FULLSCREEN_OVERDRAG_PX = 48;
const SNAP_FULLSCREEN_OVERDRAG_PHONE_PX = 24;
const SNAP_ANIMATION_MS = 160;

function computeDockedDefaultHeight(el: HTMLElement): number {
  const width = el.clientWidth;
  if (width <= 0) return DEFAULT_DOCKED_HEIGHT;
  // On a phone the call takes most of the screen and the chat keeps a small strip at the bottom;
  // the resize bar moves that split.
  if (window.innerWidth <= 768) return Math.round(window.innerHeight * 0.76);
  return Math.max(
    MIN_DOCKED_HEIGHT,
    Math.min(width / RATIO_W_TO_H, Math.round(window.innerHeight * MAX_DOCKED_HEIGHT_FRACTION))
  );
}

const PIP_W = 420;
const PIP_H = 270;
const PIP_BOTTOM = 88;
const PIP_RIGHT = 24;

/** Floating-window size and margins; mirrors the phone override in CallLayer.css.ts. */
function pipMetrics() {
  const phone = window.innerWidth <= 768;
  const w = phone ? Math.min(PIP_W, window.innerWidth - 24) : PIP_W;
  const h = phone ? Math.min(PIP_H, Math.round(w * 0.64)) : PIP_H;
  return { w, h, right: phone ? 12 : PIP_RIGHT, bottom: phone ? 72 : PIP_BOTTOM };
}

function defaultPipPos() {
  const m = pipMetrics();
  return {
    x: window.innerWidth - m.w - m.right,
    y: window.innerHeight - m.h - m.bottom,
  };
}

export function CallLayer({ client }: Props) {
  const { t } = useTranslation();
  const ui = useAtomValue(callUiAtom);
  const setUi = useSetAtom(callUiAtom);
  const { containerRef } = useCallContainer();

  const { accept, decline } = useIncomingCall(client);
  useSoundboardReceiver(client);

  const inCall = ui.roomId !== null;
  const view = useAtomValue(callEffectiveViewAtom);
  const isVoiceRoomCall = useAtomValue(callIsVoiceRoomAtom);
  const isHidden = view === 'hidden';
  const isPip = view === 'tile';
  const isFullscreen = view === 'fullscreen';
  const isDocked = view === 'docked';
  // Phones and tablets: the fullscreen call has a header of its own, with a way to minimize it.
  const dedicatedScreen = useAtomValue(callDedicatedScreenAtom);
  const isDedicatedScreen = isFullscreen && dedicatedScreen;
  const popoutOpen = useAtomValue(callPopoutOpenAtom);
  const popoutRoot = useAtomValue(callPopoutRootAtom);

  // Popped out into its own window (desktop): the call's interface is in that window, and what is
  // left here (the call engine) keeps running out of sight.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return undefined;
    el.style.visibility = isPip && popoutOpen ? 'hidden' : '';
    return () => {
      el.style.visibility = '';
    };
  }, [containerRef, isPip, popoutOpen]);

  const joined = ui.phase === 'joined';
  const callSession = useAtomValue(callSessionAtom);
  const callRoom = useRoom(callSession?.roomId);
  const roomName = callRoom?.name ?? ui.roomId ?? '';

  const [containerEl, setContainerEl] = useState<HTMLDivElement | null>(null);
  const [dockedHeight, setDockedHeight] = useState(DEFAULT_DOCKED_HEIGHT);
  const [isDragging, setIsDragging] = useState(false);
  const [snapFullscreen, setSnapFullscreen] = useState(false);
  const callActions = useAtomValue(callActionsAtom);

  const pipPosRef = useRef<{ x: number; y: number } | null>(null);
  const cancelCollapseRef = useRef<(() => void) | null>(null);
  const defaultHeightRef = useRef<number | null>(null);
  const userResizedRef = useRef(false);
  const lastViewRef = useRef<CallView>('hidden');
  const cancelSnapRef = useRef<(() => void) | null>(null);
  const draggingRef = useRef(false);

  // Grab the container element once mounted so we can portal chrome into it.
  useEffect(() => {
    setContainerEl(containerRef.current);
  }, [containerRef]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    // Cancel any pending collapse so a re-join expands cleanly from 0.
    cancelCollapseRef.current?.();
    cancelCollapseRef.current = null;

    const previousView = lastViewRef.current;
    lastViewRef.current = view;
    const instant =
      previousView !== view &&
      [previousView, view].some((v) => v === 'hidden' || v === 'fullscreen');
    const pendingSnap = cancelSnapRef.current;
    cancelSnapRef.current = null;
    if (instant) {
      el.style.transition = 'none';
      const restore = () => {
        cancelSnapRef.current = null;
        if (draggingRef.current) return;
        el.style.transition = '';
      };
      let inner = 0;
      const outer = requestAnimationFrame(() => {
        inner = requestAnimationFrame(restore);
      });
      cancelSnapRef.current = () => {
        cancelAnimationFrame(outer);
        cancelAnimationFrame(inner);
      };
    } else if (pendingSnap && !draggingRef.current) {
      el.style.transition = '';
    }

    if (!inCall) {
      el.classList.add(css.containerActive);
      el.classList.remove(css.pip, css.fullscreen);
      el.style.left = '';
      el.style.top = '';
      el.style.right = '';
      el.style.bottom = '';
      el.style.height = '0px';
      el.style.paddingTop = '0px';

      let cancelled = false;
      const timer = window.setTimeout(() => {
        if (cancelled) return;
        el.classList.remove(css.containerActive, css.pip, css.fullscreen);
        cancelCollapseRef.current = null;
      }, 320);
      cancelCollapseRef.current = () => {
        cancelled = true;
        window.clearTimeout(timer);
      };
      return;
    }

    if (isHidden) {
      el.classList.remove(css.containerActive, css.fullscreen);
      el.classList.add(css.pip);
      el.style.left = '';
      el.style.top = '';
      el.style.right = '';
      el.style.bottom = '';
      el.style.height = '';
      el.style.paddingTop = '0px';
      return;
    }

    el.classList.add(css.containerActive);
    if (isFullscreen) {
      el.classList.remove(css.pip);
      el.classList.add(css.fullscreen);
      el.style.left = '';
      el.style.top = '';
      el.style.right = '';
      el.style.bottom = '';
      el.style.height = '';
      el.style.paddingTop = isDedicatedScreen ? `${DOCKED_HEADER_HEIGHT}px` : '0px';
    } else if (isPip) {
      el.classList.remove(css.fullscreen);
      el.classList.add(css.pip);
      el.style.height = '';
      el.style.paddingTop = '0px';
      const pos = pipPosRef.current ?? defaultPipPos();
      pipPosRef.current = pos;
      el.style.left = `${pos.x}px`;
      el.style.top = `${pos.y}px`;
      el.style.right = 'auto';
      el.style.bottom = 'auto';
    } else {
      el.classList.remove(css.pip, css.fullscreen);
      el.style.left = '';
      el.style.top = '';
      el.style.right = '';
      el.style.bottom = '';
      el.style.paddingTop = `${DOCKED_HEADER_HEIGHT}px`;
      if (defaultHeightRef.current === null) {
        defaultHeightRef.current = computeDockedDefaultHeight(el);
      }
      const targetHeight = userResizedRef.current ? dockedHeight : defaultHeightRef.current;
      el.style.height = `${targetHeight}px`;
      if (dockedHeight !== targetHeight) setDockedHeight(targetHeight);
    }
  }, [inCall, view, isHidden, isPip, isFullscreen, isDedicatedScreen, dockedHeight, containerRef]);

  useEffect(() => {
    return () => {
      cancelCollapseRef.current?.();
      cancelSnapRef.current?.();
    };
  }, []);

  const showPresentation = useCallback(
    (next: CallPresentation) => {
      setUi((prev) => ({ ...prev, presentation: next }));
    },
    [setUi]
  );

  useEffect(() => {
    if (!isFullscreen || (isVoiceRoomCall && !dedicatedScreen)) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      const target = e.target instanceof Element ? e.target : null;
      if (
        target?.closest(
          'input, textarea, select, [contenteditable="true"], [role="dialog"], [role="menu"], [role="listbox"]'
        )
      ) {
        return;
      }
      if (document.querySelector('[role="dialog"], [role="menu"], [role="listbox"]')) return;
      showPresentation(dedicatedScreen ? 'tile' : 'room');
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isFullscreen, isVoiceRoomCall, dedicatedScreen, showPresentation]);

  const handleResizeStart = useCallback(
    (e: React.PointerEvent) => {
      if (view !== 'docked') return;
      e.preventDefault();
      userResizedRef.current = true;
      setIsDragging(true);
      const el = containerRef.current;
      if (el) el.style.transition = 'none';
      draggingRef.current = true;
      const startY = e.clientY;
      const startHeight = dockedHeight;
      // Pointer events so the same drag works with a finger as with a mouse.
      const phone = window.innerWidth <= 768;
      const maxHeight = window.innerHeight * (phone ? 0.88 : 0.8);
      const overdrag = phone ? SNAP_FULLSCREEN_OVERDRAG_PHONE_PX : SNAP_FULLSCREEN_OVERDRAG_PX;
      let snapping = false;
      const handleMove = (ev: PointerEvent) => {
        const raw = startHeight + ev.clientY - startY;
        const snap = raw > maxHeight + overdrag;
        if (snap !== snapping) {
          snapping = snap;
          setSnapFullscreen(snap);
          if (el) el.style.transition = snap ? `height ${SNAP_ANIMATION_MS}ms ease` : 'none';
        }
        const available = el?.parentElement?.clientHeight ?? window.innerHeight;
        setDockedHeight(snap ? available : Math.max(120, Math.min(raw, maxHeight)));
      };
      const handleUp = (ev: PointerEvent) => {
        setIsDragging(false);
        setSnapFullscreen(false);
        draggingRef.current = false;
        if (el) el.style.transition = '';
        document.removeEventListener('pointermove', handleMove);
        document.removeEventListener('pointerup', handleUp);
        document.removeEventListener('pointercancel', handleUp);
        if (snapping) {
          // Back to the docked size it had, for when the call is docked again. A cancelled gesture
          // (the system took over the touch) only undoes the preview.
          setDockedHeight(startHeight);
          if (ev.type === 'pointerup') callActions?.setPresentation('fullscreen');
        }
      };
      document.addEventListener('pointermove', handleMove);
      document.addEventListener('pointerup', handleUp);
      document.addEventListener('pointercancel', handleUp);
    },
    [dockedHeight, view, containerRef, callActions]
  );

  const pipDragCleanupRef = useRef<(() => void) | null>(null);
  useEffect(() => {
    return () => {
      pipDragCleanupRef.current?.();
    };
  }, []);
  useEffect(() => {
    if (!isPip) pipDragCleanupRef.current?.();
  }, [isPip]);

  const handlePipDragStart = useCallback(
    (e: React.MouseEvent) => {
      if (!isPip) return;
      e.preventDefault();
      pipDragCleanupRef.current?.();
      const el = containerRef.current;
      if (!el) return;
      const startX = e.clientX;
      const startY = e.clientY;
      const startPos = pipPosRef.current ?? defaultPipPos();
      pipPosRef.current = startPos;
      const handleMouseMove = (ev: MouseEvent) => {
        const x = Math.max(
          0,
          Math.min(ev.clientX - (startX - startPos.x), window.innerWidth - pipMetrics().w)
        );
        const y = Math.max(
          0,
          Math.min(ev.clientY - (startY - startPos.y), window.innerHeight - pipMetrics().h)
        );
        pipPosRef.current = { x, y };
        el.style.left = `${x}px`;
        el.style.top = `${y}px`;
      };
      const handleMouseUp = () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
        pipDragCleanupRef.current = null;
      };
      pipDragCleanupRef.current = handleMouseUp;
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    },
    [isPip, containerRef]
  );

  // The call's interface goes into the window of its own when there is one, otherwise into the
  // container in the app. In the window it is always shown, whatever the main window is showing.
  const uiEl = popoutOpen ? popoutRoot : containerEl;
  const showUi = popoutOpen || !isHidden;
  const inUi = (node: React.ReactNode) =>
    uiEl &&
    createPortal(
      popoutOpen && popoutRoot ? (
        <CallWindowProvider root={popoutRoot}>{node}</CallWindowProvider>
      ) : (
        node
      ),
      uiEl
    );

  return (
    <>
      {isDocked &&
        containerEl &&
        createPortal(
          <div className={css.header}>
            <span className={css.headerTitle}>
              <SpeakerHighIcon size={14} className={css.headerIcon} />
              {roomName}
            </span>
          </div>,
          containerEl
        )}

      {isDedicatedScreen &&
        containerEl &&
        createPortal(
          <div className={css.header}>
            <button
              type="button"
              className={css.headerButton}
              onClick={() => showPresentation('tile')}
              aria-label={t('call.minimize')}
            >
              <CaretDownIcon size={20} />
            </button>
            <span className={css.headerTitle}>
              <SpeakerHighIcon size={14} className={css.headerIcon} />
              {roomName}
            </span>
          </div>,
          containerEl
        )}

      {isPip &&
        containerEl &&
        createPortal(
          <div className={css.pipNav} onMouseDown={handlePipDragStart}>
            <span className={css.pipNavTitle}>
              <SpeakerHighIcon size={14} />
              {roomName}
            </span>
          </div>,
          containerEl
        )}

      {isDocked &&
        containerEl &&
        createPortal(
          <>
            {isDragging && <div className={css.dragOverlay} />}
            {snapFullscreen && <div className={css.snapHint} />}
            <div
              className={css.resizeBar}
              onPointerDown={handleResizeStart}
              style={{ transition: isDragging ? 'none' : undefined }}
            />
          </>,
          containerEl
        )}

      {inCall && callSession && showUi && inUi(<CallStage />)}

      {inCall && joined && showUi && inUi(<CallControlBar />)}

      {inCall && joined && showUi && (popoutOpen || !isPip) && inUi(<CallReactionsRail />)}

      {inCall &&
        joined &&
        ui.isScreenSharing &&
        showUi &&
        (popoutOpen || !isPip) &&
        inUi(<ScreenShareNotice />)}

      <CallPopoutWindow />

      {ui.incoming && client && (
        <IncomingCallOverlay
          callerName={ui.incoming.callerName}
          callerId={ui.incoming.callerId}
          voiceOnly={ui.incoming.voiceOnly}
          roomName={ui.incoming.roomName}
          client={client}
          onAccept={() => accept(ui.incoming!)}
          onDecline={decline}
        />
      )}
    </>
  );
}
