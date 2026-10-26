import { useRef, useState } from 'react';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import { Toggle } from '@/app/components/Toggle';
import { useTranslation } from 'react-i18next';
import {
  ArrowSquareInIcon,
  ArrowSquareOutIcon,
  ArrowsInIcon,
  ArrowsOutIcon,
  ChatTextIcon,
  DotsThreeVerticalIcon,
  MicrophoneIcon,
  MicrophoneSlashIcon,
  MonitorArrowUpIcon,
  PhoneXIcon,
  PresentationIcon,
  SmileyIcon,
  SquaresFourIcon,
  VideoCameraIcon,
  VideoCameraSlashIcon,
} from '@phosphor-icons/react';
import { Tooltip } from '@/app/components/Tooltip';
import { Popover } from '@/app/components/Popover';
import {
  callActionsAtom,
  callEffectiveViewAtom,
  callIsVoiceRoomAtom,
  callUiAtom,
  callSessionAtom,
  showNonVideoParticipantsAtom,
} from '@/app/store/atoms/call';
import {
  openRoomChatAtom,
  closeRoomChatAtom,
  roomChatPanelOpenAtom,
  roomChatRoomIdAtom,
} from '@/app/store/atoms';
import { useReturnToCall } from './useReturnToCall';
import { DeviceControl } from './DeviceMenu';
import { PushToTalkDot } from './PushToTalkDot';
import { useCallSnapshot } from './stage/useCallSnapshot';
import * as css from './CallControlBar.css';

export function CallControlBar() {
  const { t } = useTranslation();
  const ui = useAtomValue(callUiAtom);
  const actions = useAtomValue(callActionsAtom);
  const view = useAtomValue(callEffectiveViewAtom);
  const isVoiceCall = useAtomValue(callIsVoiceRoomAtom);
  const callSession = useAtomValue(callSessionAtom);
  const [showNonVideo, setShowNonVideo] = useAtom(showNonVideoParticipantsAtom);
  const hasVideo = !!useCallSnapshot()?.participants.some((p) => p.cameraTrack || p.screenShared);
  const roomChatOpen = useAtomValue(roomChatPanelOpenAtom);
  const roomChatRoomId = useAtomValue(roomChatRoomIdAtom);
  const openRoomChat = useSetAtom(openRoomChatAtom);
  const closeRoomChat = useSetAtom(closeRoomChatAtom);
  const returnToCall = useReturnToCall();
  const menuBtnRef = useRef<HTMLSpanElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  if (!actions) return null;

  const micTitle = ui.isMuted ? t('voice.unmute') : t('voice.mute');
  const cameraTitle = ui.isVideoMuted ? t('voice.cameraOff') : t('voice.cameraOn');
  const shareTitle = ui.isScreenSharing ? t('voice.stopShare') : t('voice.shareScreen');
  const viewTitle = ui.isSpotlight ? t('voice.switchToGrid') : t('voice.switchToSpotlight');
  const closeMenu = () => setMenuOpen(false);

  const chatRoomId = ui.roomId;
  const chatOpen = roomChatOpen && roomChatRoomId === chatRoomId;
  const chatTitle = chatOpen ? t('common.close') : t('room.openChat');
  const toggleChat = () => {
    if (!chatRoomId) return;
    if (chatOpen) closeRoomChat();
    else openRoomChat(chatRoomId);
  };

  return (
    <div className={css.bar} role="group" aria-label={t('voice.controls')}>
      <div className={css.group}>
        <DeviceControl
          kinds={['audioinput', 'audiooutput']}
          label={t('call.audioSettings')}
          variant="bar"
        >
          <Tooltip content={micTitle}>
            <button
              type="button"
              className={ui.isMuted ? css.ctrlDanger : css.ctrl}
              onClick={() => actions.toggleMute()}
              aria-label={micTitle}
              aria-pressed={ui.isMuted}
            >
              <PushToTalkDot>
                {ui.isMuted ? <MicrophoneSlashIcon size={20} /> : <MicrophoneIcon size={20} />}
              </PushToTalkDot>
            </button>
          </Tooltip>
        </DeviceControl>

        <DeviceControl kinds={['videoinput']} label={t('call.cameraSettings')} variant="bar">
          <Tooltip content={cameraTitle}>
            <button
              type="button"
              className={ui.isVideoMuted ? css.ctrl : css.ctrlActive}
              onClick={() => actions.toggleVideo()}
              aria-label={cameraTitle}
              aria-pressed={ui.isVideoMuted}
            >
              {ui.isVideoMuted ? (
                <VideoCameraSlashIcon size={20} />
              ) : (
                <VideoCameraIcon size={20} weight="fill" />
              )}
            </button>
          </Tooltip>
        </DeviceControl>

        <Tooltip content={shareTitle}>
          <button
            type="button"
            className={ui.isScreenSharing ? css.ctrlActive : css.ctrl}
            onClick={() => actions.toggleScreenshare()}
            aria-label={shareTitle}
            aria-pressed={ui.isScreenSharing}
          >
            <MonitorArrowUpIcon size={20} weight={ui.isScreenSharing ? 'fill' : 'regular'} />
          </button>
        </Tooltip>
      </div>

      <span className={css.divider} />

      <div className={css.group}>
        {view !== 'docked' && (
          <Tooltip content={viewTitle}>
            <button
              type="button"
              className={css.ctrl}
              onClick={() => actions.setSpotlight(!ui.isSpotlight)}
              aria-label={viewTitle}
              aria-pressed={ui.isSpotlight}
            >
              {ui.isSpotlight ? <PresentationIcon size={20} /> : <SquaresFourIcon size={20} />}
            </button>
          </Tooltip>
        )}

        {(isVoiceCall || view === 'fullscreen') && (
          <Tooltip content={chatTitle}>
            <button
              type="button"
              className={chatOpen ? css.ctrlAccent : css.ctrl}
              onClick={toggleChat}
              aria-label={chatTitle}
              aria-pressed={chatOpen}
            >
              <ChatTextIcon size={20} />
            </button>
          </Tooltip>
        )}

        <span ref={menuBtnRef} className={css.menuAnchor}>
          <Tooltip content={t('voice.moreOptions')}>
            <button
              type="button"
              className={menuOpen ? css.ctrlAccent : css.ctrl}
              onClick={() => setMenuOpen((open) => !open)}
              aria-label={t('voice.moreOptions')}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
            >
              <DotsThreeVerticalIcon size={20} weight="bold" />
            </button>
          </Tooltip>
        </span>

        <Tooltip content={t('voice.hangup')}>
          <button
            type="button"
            className={css.ctrlDanger}
            onClick={() => actions.hangup()}
            aria-label={t('voice.hangup')}
          >
            <PhoneXIcon size={20} />
          </button>
        </Tooltip>
      </div>

      <Popover
        open={menuOpen}
        onClose={closeMenu}
        anchorRef={menuBtnRef}
        placement="top"
        role="menu"
        dense
      >
        <div className={css.menu}>
          {(view === 'fullscreen' || view === 'docked') && (
            <button
              type="button"
              role="menuitem"
              className={css.menuItem}
              onClick={() => {
                actions.setPresentation('tile');
                closeMenu();
              }}
            >
              <ArrowSquareOutIcon size={16} />
              <span className={css.menuItemLabel}>{t('voice.popOut')}</span>
              <span className={css.menuItemSpacer} />
            </button>
          )}

          {view === 'docked' && (
            <button
              type="button"
              role="menuitem"
              className={css.menuItem}
              onClick={() => {
                actions.setPresentation('fullscreen');
                closeMenu();
              }}
            >
              <ArrowsOutIcon size={16} />
              <span className={css.menuItemLabel}>{t('voice.fullscreen')}</span>
              <span className={css.menuItemSpacer} />
            </button>
          )}

          {view === 'fullscreen' && !isVoiceCall && (
            <button
              type="button"
              role="menuitem"
              className={css.menuItem}
              onClick={() => {
                actions.setPresentation('room');
                closeMenu();
              }}
            >
              <ArrowsInIcon size={16} />
              <span className={css.menuItemLabel}>{t('voice.exitFullscreen')}</span>
              <span className={css.menuItemSpacer} />
            </button>
          )}

          {view === 'tile' && (
            <button
              type="button"
              role="menuitem"
              className={css.menuItem}
              onClick={() => {
                returnToCall();
                closeMenu();
              }}
            >
              <ArrowSquareInIcon size={16} />
              <span className={css.menuItemLabel}>{t('voice.returnToCall')}</span>
              <span className={css.menuItemSpacer} />
            </button>
          )}

          <div className={css.menuDivider} role="separator" />

          {callSession && (
            <>
              <label className={css.menuItem}>
                <VideoCameraIcon size={16} />
                <span className={css.menuItemLabel}>{t('call.showNonVideo')}</span>
                <Toggle
                  size="sm"
                  checked={showNonVideo}
                  disabled={!hasVideo}
                  onChange={setShowNonVideo}
                  ariaLabel={t('call.showNonVideo')}
                />
              </label>
              <div className={css.menuDivider} role="separator" />
            </>
          )}

          <button
            type="button"
            role="menuitem"
            className={css.menuItem}
            onClick={() => {
              actions.openReactions();
              closeMenu();
            }}
          >
            <SmileyIcon size={16} />
            <span className={css.menuItemLabel}>{t('voice.reactions')}</span>
            <span className={css.menuItemSpacer} />
          </button>
        </div>
      </Popover>
    </div>
  );
}
