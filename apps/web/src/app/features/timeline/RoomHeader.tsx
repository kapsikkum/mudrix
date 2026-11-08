import { useState, useEffect, useRef } from 'react';
import type { WizardClient as MatrixClient } from '@wizardchat/core';
import {
  LockSimpleIcon,
  LockSimpleOpenIcon,
  PushPinIcon,
  PhoneIcon,
  HashStraightIcon,
  SpeakerHighIcon,
  UsersIcon,
  ChatDotsIcon,
  ListIcon,
  DotsThreeVerticalIcon,
  CalendarBlankIcon,
  MagnifyingGlassIcon,
} from '@phosphor-icons/react';
import { useContextMenu } from '@/app/hooks/useContextMenu';
import { useTranslation } from 'react-i18next';
import { useAtomValue, useSetAtom } from 'jotai';
import { Tooltip } from '@/app/components/Tooltip';
import {
  membersPanelOpenAtom,
  threadsPanelViewAtom,
  roomSettingsRoomIdAtom,
  roomSettingsTabAtom,
  mobileDrawerOpenAtom,
  globalSearchOpenAtom,
} from '@/app/store/atoms';
import { useMediaQuery } from '@/app/hooks/useMediaQuery';
import { useCanSendState } from '@/app/hooks/useCanSendState';
import { useHasUnreadThreads } from '@/app/hooks/useHasUnreadThreads';
import { useRoom } from '@/app/data';
import { isVoiceRoom } from '@/util/matrix';
import { isModOnly } from '@/app/features/keyboardShortcuts/keyEvents';
import { PinnedMessagesPopover } from './PinnedMessagesPopover';
import * as css from './RoomHeader.css';

interface RoomHeaderProps {
  client: MatrixClient;
  roomId: string;
  onJumpToEvent?: (eventId: string) => void;
  onStartCall?: (roomId: string) => void;
  callActive?: boolean;
  othersInCall?: boolean;
}

export function RoomHeader({
  client,
  roomId,
  onJumpToEvent,
  onStartCall,
  callActive = false,
  othersInCall = false,
}: RoomHeaderProps) {
  const { t } = useTranslation();
  const toggleMembersPanel = useSetAtom(membersPanelOpenAtom);
  const setThreadsPanelView = useSetAtom(threadsPanelViewAtom);
  const membersPanelOpen = useAtomValue(membersPanelOpenAtom);
  const threadsPanelView = useAtomValue(threadsPanelViewAtom);
  const setRoomSettingsId = useSetAtom(roomSettingsRoomIdAtom);
  const setRoomSettingsTab = useSetAtom(roomSettingsTabAtom);
  const hasUnreadThreads = useHasUnreadThreads(roomId);
  const room = useRoom(roomId);
  const encrypted = room?.isEncrypted ?? false;
  const [showPinned, setShowPinned] = useState(false);
  const merged = useMediaQuery('(max-width: 768px)');
  const setDrawerOpen = useSetAtom(mobileDrawerOpenAtom);

  useEffect(() => {
    if (!onJumpToEvent) return;
    const handler = (e: KeyboardEvent) => {
      if (e.defaultPrevented || !isModOnly(e) || e.altKey || e.shiftKey) return;
      if (e.key.toLowerCase() !== 'p') return;
      e.preventDefault();
      setShowPinned((v) => !v);
      setShowTopic(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onJumpToEvent]);
  const [showTopic, setShowTopic] = useState(false);
  // Calls are available in any joined room (DM or group) that isn't a space.
  const can = useCanSendState(roomId);
  const canJoinCall = can('org.matrix.msc3401.call.member');
  const callSupported = (() => {
    if (!room) return false;
    return !room.isInvite;
  })();
  // Voice rooms are joined from the sidebar, so the header button is not an entry point there.
  const openGlobalSearch = useSetAtom(globalSearchOpenAtom);
  const { openContextMenu } = useContextMenu();
  const [, setShowJumpToDate] = useState(false);
  const isVoice = isVoiceRoom(room);
  const callLive = callActive || othersInCall;
  const callDisabled = callActive || isVoice || !canJoinCall;
  const callLabel = isVoice
    ? t('room.joinVoice')
    : callActive
      ? t('voice.callActive')
      : othersInCall
        ? t('voice.joinCall')
        : t('voice.startCall');
  const hasLeftHeaderActions =
    (callSupported && onStartCall !== undefined) || onJumpToEvent !== undefined;

  const pinnedAnchorRef = useRef<HTMLDivElement>(null);

  const topicPanelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!showTopic) return;
    const handler = (e: MouseEvent | KeyboardEvent) => {
      const target = e.target as Node;
      if (e.type === 'keydown') {
        if ((e as KeyboardEvent).key === 'Escape') setShowTopic(false);
        return;
      }
      if (
        topicPanelRef.current &&
        !topicPanelRef.current.contains(target) &&
        !(target instanceof Element && target.closest('[data-topic-trigger]'))
      ) {
        setShowTopic(false);
      }
    };
    document.addEventListener('mousedown', handler);
    document.addEventListener('keydown', handler);
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('keydown', handler);
    };
  }, [showTopic]);

  useEffect(() => {
    setShowTopic(false);
  }, [roomId]);

  const roomName = room?.name ?? roomId;
  const topic = room?.topic?.trim() ?? '';

  return (
    <div className={css.headerWrapper}>
      {/* Main header bar */}
      <div className={css.header}>
        {merged && (
          <button
            type="button"
            className={css.headerBtn}
            onClick={() => setDrawerOpen(true)}
            aria-label={t('common.menu')}
          >
            <ListIcon size={20} />
          </button>
        )}
        <div className={css.nameContainer}>
          <div className={css.nameRow}>
            {isVoice ? (
              <SpeakerHighIcon size={16} className={css.roomIcon} weight="fill" />
            ) : (
              <HashStraightIcon size={16} className={css.roomIcon} />
            )}
            <Tooltip content={roomId}>
              <h1 className={css.roomName}>{roomName}</h1>
            </Tooltip>
            {room && !room.isSpace && (
              <Tooltip
                content={encrypted ? t('encryption.encrypted') : t('encryption.notEncrypted')}
              >
                <button
                  type="button"
                  className={encrypted ? css.encryptionBtn : css.encryptionBtnOff}
                  aria-label={encrypted ? t('encryption.encrypted') : t('encryption.notEncrypted')}
                  onClick={() => {
                    setRoomSettingsTab('general');
                    setRoomSettingsId(roomId);
                  }}
                >
                  {encrypted ? (
                    <LockSimpleIcon size={14} weight="fill" />
                  ) : (
                    <LockSimpleOpenIcon size={14} />
                  )}
                </button>
              </Tooltip>
            )}
          </div>
          {topic && (
            <>
              <span className={css.topicDivider} />
              <button
                type="button"
                className={css.topicTrigger}
                data-topic-trigger="true"
                aria-expanded={showTopic}
                onClick={() => {
                  setShowTopic((v) => !v);
                  setShowPinned(false);
                }}
              >
                {topic}
              </button>
            </>
          )}
        </div>

        {/* Call button - available in DM and group rooms */}
        {callSupported && onStartCall && (
          <Tooltip content={callLabel}>
            <button
              type="button"
              className={callLive ? css.headerBtnActive : css.headerBtn}
              aria-label={callLabel}
              onClick={() => onStartCall(roomId)}
              disabled={callDisabled}
            >
              <PhoneIcon size={16} weight={callLive ? 'fill' : 'regular'} />
            </button>
          </Tooltip>
        )}

        {/* Pinned button */}
        {onJumpToEvent && !merged && (
          <div ref={pinnedAnchorRef} className={css.headerBtnAnchor}>
            <Tooltip content={t('room.header.pinnedMessages')}>
              <button
                type="button"
                className={showPinned ? css.headerBtnActive : css.headerBtn}
                aria-label={t('room.header.pinnedMessages')}
                onClick={() => {
                  setShowPinned((v) => !v);
                  setShowTopic(false);
                }}
              >
                <PushPinIcon size={16} weight={showPinned ? 'fill' : 'regular'} />
              </button>
            </Tooltip>
          </div>
        )}

        {/* Jump to date button */}
        {onJumpToEvent && !merged && (
          <Tooltip content={t('room.jumpToDate.title')}>
            <button
              type="button"
              className={css.headerBtn}
              aria-label={t('room.jumpToDate.title')}
              onClick={() => {
                setShowJumpToDate(true);
                setShowPinned(false);
                setShowTopic(false);
              }}
            >
              <CalendarBlankIcon size={16} />
            </button>
          </Tooltip>
        )}

        {merged && (
          <>
            <button
              type="button"
              className={threadsPanelView ? css.headerBtnActive : css.headerBtn}
              aria-label={t('timeline.threads')}
              onClick={() => setThreadsPanelView((prev) => (prev ? null : { type: 'list' }))}
            >
              <span className={css.headerThreadIconWrap}>
                <ChatDotsIcon size={18} weight={threadsPanelView ? 'fill' : 'regular'} />
                {hasUnreadThreads && <span className={css.headerThreadDot} />}
              </span>
            </button>
            <button
              type="button"
              className={membersPanelOpen ? css.headerBtnActive : css.headerBtn}
              aria-label={t('common.members')}
              onClick={() => toggleMembersPanel((v) => !v)}
            >
              <UsersIcon size={18} weight={membersPanelOpen ? 'fill' : 'regular'} />
            </button>
            <div ref={pinnedAnchorRef} className={css.headerBtnAnchor}>
              <button
                type="button"
                className={css.headerBtn}
                aria-label={t('common.more', { defaultValue: 'More' })}
                onClick={(e) =>
                  openContextMenu(e, [
                    ...(onJumpToEvent
                      ? [
                          {
                            label: t('room.header.pinnedMessages'),
                            icon: <PushPinIcon size={18} />,
                            onClick: () => {
                              setShowPinned(true);
                              setShowTopic(false);
                            },
                          },
                          {
                            label: t('room.jumpToDate.title'),
                            icon: <CalendarBlankIcon size={18} />,
                            onClick: () => {
                              setShowJumpToDate(true);
                              setShowPinned(false);
                              setShowTopic(false);
                            },
                          },
                        ]
                      : []),
                    {
                      label: t('roomSwitcher.title'),
                      icon: <MagnifyingGlassIcon size={18} />,
                      onClick: () => openGlobalSearch(true),
                    },
                  ])
                }
              >
                <DotsThreeVerticalIcon size={20} weight="bold" />
              </button>
            </div>
          </>
        )}

        <div className={css.desktopOnly}>
          {hasLeftHeaderActions && <div className={css.headerDivider} />}

          {/* Threads toggle button */}
          <Tooltip content={t('timeline.threads')}>
            <button
              type="button"
              className={threadsPanelView ? css.headerBtnActive : css.headerBtn}
              aria-label={t('timeline.threads')}
              onClick={() => setThreadsPanelView((prev) => (prev ? null : { type: 'list' }))}
            >
              <span className={css.headerThreadIconWrap}>
                <ChatDotsIcon size={16} weight={threadsPanelView ? 'fill' : 'regular'} />
                {hasUnreadThreads && <span className={css.headerThreadDot} />}
              </span>
            </button>
          </Tooltip>

          {/* Members toggle button */}
          <Tooltip content={t('common.members')}>
            <button
              type="button"
              className={membersPanelOpen ? css.headerBtnActive : css.headerBtn}
              aria-label={t('common.members')}
              onClick={() => toggleMembersPanel((v) => !v)}
            >
              <UsersIcon size={16} weight={membersPanelOpen ? 'fill' : 'regular'} />
            </button>
          </Tooltip>
        </div>
      </div>

      {/* Pinned messages */}
      {showPinned && onJumpToEvent && (
        <PinnedMessagesPopover
          client={client}
          roomId={roomId}
          open
          onClose={() => setShowPinned(false)}
          anchorRef={pinnedAnchorRef}
          onJumpTo={onJumpToEvent}
        />
      )}

      {showTopic && (
        <div ref={topicPanelRef}>
          <div className={css.topicPanel}>
            <p className={css.topicPanelText}>{topic}</p>
          </div>
        </div>
      )}
    </div>
  );
}
