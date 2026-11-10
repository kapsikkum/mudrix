import { useRef, useState } from 'react';
import { useAtomValue, useSetAtom } from 'jotai';
import { useTranslation } from 'react-i18next';
import {
  CellSignalHighIcon,
  HeadphonesIcon,
  MicrophoneIcon,
  MicrophoneSlashIcon,
  MonitorArrowUpIcon,
  PhoneXIcon,
  VideoCameraIcon,
  VideoCameraSlashIcon,
  YoutubeLogoIcon,
} from '@phosphor-icons/react';
import { Tooltip } from '@/app/components/Tooltip';
import { callUiAtom, callActionsAtom } from '@/app/store/atoms/call';
import { useRoom } from '@/app/data';
import { useReturnToCall } from './useReturnToCall';
import { useCallTileVisible } from './useCallParticipants';
import { useCallSnapshot } from './stage/useCallSnapshot';
import { useMediaQuery } from '@/app/hooks/useMediaQuery';
import { useGlobalVoiceState } from '@/app/features/voice/useGlobalVoice';
import { SoundboardButton } from '@/app/features/soundboard/SoundboardButton';
import { CallStatsPopover } from './CallStatsPopover';
import { watchDialogOpenAtom, watchStateAtom } from './watchTogether/watchTogether';
import * as css from './CallBar.css';

/**
 * The call's own panel in the sidebar, above the user panel: status (opens the connection stats)
 * and room on top with a way to leave, then the call actions (camera, screen share, watch
 * together, soundboard). On mobile there is no user panel, so mute and deafen sit in the header.
 */
export function CallBar() {
  const { t } = useTranslation();
  const ui = useAtomValue(callUiAtom);
  const actions = useAtomValue(callActionsAtom);
  const returnToCall = useReturnToCall();
  const isMobile = useMediaQuery('(max-width: 768px)');
  const { micMuted, deafened, toggleMic, toggleDeafen } = useGlobalVoiceState();
  const watching = useAtomValue(watchStateAtom) !== null;
  const setWatchDialogOpen = useSetAtom(watchDialogOpenAtom);

  const roomId = ui.roomId;
  const room = useRoom(roomId);
  const roomName = room?.name ?? roomId ?? '';

  const joined = ui.phase === 'joined';
  const tileVisible = useCallTileVisible();
  const snapshot = useCallSnapshot();
  const reconnecting = snapshot?.reconnecting ?? false;
  const connected = joined && tileVisible && !reconnecting && !snapshot?.awaitingMembership;
  const CamIcon = ui.isVideoMuted ? VideoCameraSlashIcon : VideoCameraIcon;
  const videoTitle = ui.isVideoMuted ? t('call.cameraOff') : t('call.cameraOn');
  const shareTitle = ui.isScreenSharing ? t('call.stopShare') : t('call.shareScreen');
  const statusRef = useRef<HTMLButtonElement>(null);
  const [statsOpen, setStatsOpen] = useState(false);

  if (!roomId) return null;

  return (
    <div className={css.bar}>
      <div className={css.header}>
        <div className={css.info}>
          <button
            ref={statusRef}
            type="button"
            className={connected ? css.statusRow : css.statusRowConnecting}
            onClick={() => setStatsOpen((v) => !v)}
            aria-haspopup="dialog"
            aria-expanded={statsOpen}
          >
            <CellSignalHighIcon size={14} weight="bold" />
            <span className={css.callStatus}>
              {reconnecting
                ? t('call.statusReconnecting')
                : connected
                  ? t('call.statusConnected')
                  : t('call.statusConnecting')}
            </span>
          </button>
          <CallStatsPopover
            open={statsOpen}
            onClose={() => setStatsOpen(false)}
            anchorRef={statusRef}
          />
          <button type="button" className={css.callerName} onClick={returnToCall}>
            {roomName}
          </button>
        </div>

        <div className={css.controls}>
          {isMobile && (
            <>
              <button
                type="button"
                className={micMuted ? css.ctrlMuted : css.ctrl}
                onClick={toggleMic}
                aria-label={micMuted ? t('call.unmute') : t('call.mute')}
                aria-pressed={micMuted}
              >
                {micMuted ? <MicrophoneSlashIcon size={16} /> : <MicrophoneIcon size={16} />}
              </button>
              <button
                type="button"
                className={deafened ? css.ctrlMuted : css.ctrl}
                onClick={toggleDeafen}
                aria-label={deafened ? t('call.undeafen') : t('call.deafen')}
                aria-pressed={deafened}
              >
                <HeadphonesIcon size={16} weight={deafened ? 'fill' : 'regular'} />
              </button>
            </>
          )}
          <Tooltip content={t('call.hangup')}>
            <button
              type="button"
              className={css.leaveBtn}
              onClick={() => actions?.hangup()}
              aria-label={t('call.hangup')}
            >
              <PhoneXIcon size={16} />
            </button>
          </Tooltip>
        </div>
      </div>

      <div className={css.actions}>
        <Tooltip content={videoTitle}>
          <button
            type="button"
            className={ui.isVideoMuted ? css.actionBtn : css.actionBtnActive}
            onClick={() => actions?.toggleVideo()}
            aria-label={videoTitle}
            aria-pressed={!ui.isVideoMuted}
          >
            <CamIcon size={18} weight={ui.isVideoMuted ? 'regular' : 'fill'} />
          </button>
        </Tooltip>

        <Tooltip content={shareTitle}>
          <button
            type="button"
            className={ui.isScreenSharing ? css.actionBtnActive : css.actionBtn}
            onClick={() => actions?.toggleScreenshare()}
            aria-label={shareTitle}
            aria-pressed={ui.isScreenSharing}
          >
            <MonitorArrowUpIcon size={18} weight={ui.isScreenSharing ? 'fill' : 'regular'} />
          </button>
        </Tooltip>

        <Tooltip content={t('call.watchTogether.menu')}>
          <button
            type="button"
            className={watching ? css.actionBtnActive : css.actionBtn}
            onClick={() => setWatchDialogOpen(true)}
            aria-label={t('call.watchTogether.menu')}
            aria-pressed={watching}
            disabled={!connected}
          >
            <YoutubeLogoIcon size={18} weight={watching ? 'fill' : 'regular'} />
          </button>
        </Tooltip>

        <SoundboardButton
          buttonClass={css.actionBtn}
          activeClass={css.actionBtnActive}
          anchorClass={css.actionSlot}
          iconSize={18}
          fill
          disabled={!connected}
        />
      </div>
    </div>
  );
}
