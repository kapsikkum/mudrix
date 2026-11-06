import { useCallback, useRef } from 'react';
import {
  ChatCircleDotsIcon,
  EyeSlashIcon,
  GearIcon,
  WarningCircleIcon,
  HeadphonesIcon,
  MicrophoneIcon,
  MicrophoneSlashIcon,
} from '@phosphor-icons/react';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import { useTranslation } from 'react-i18next';
import { Avatar } from '@/app/components/Avatar';
import { IconButton } from '@/app/components/Button';
import {
  settingsOpenAtom,
  settingsPageAtom,
  userIdAtom,
  presenceSupportAtom,
  ownPresenceAtom,
  presenceOverrideAtom,
  userProfileAtom,
} from '@/app/store/atoms';
import type { PresenceState, PresenceOverride } from '@/app/store/atoms';
import { useContextMenu } from '@/app/hooks/useContextMenu';
import { useConfirm } from '@/app/hooks/useConfirm';
import { useStreamerMode } from '@/app/hooks/useStreamerMode';
import { useSyncReady } from '@/app/hooks/useSync';
import type { ContextMenuItem } from '@/app/features/contextMenu/contextMenuAtom';
import { useGlobalVoiceState } from '@/app/features/voice/useGlobalVoice';
import { DeviceControl } from '@/app/features/calls/DeviceMenu';
import { PushToTalkDot } from '@/app/features/calls/PushToTalkDot';
import { useCallSnapshot } from '@/app/features/calls/stage/useCallSnapshot';
import { getMatrixClientOrNull } from '@/client/initMatrix';
import { useProfile } from '@/app/data';
import { customStatusDialogOpenAtom, useUserStatusText } from '@/app/features/status/customStatus';
import * as css from './UserPanel.css';

const PRESENCE_DOT_COLOR: Record<Exclude<PresenceOverride, 'auto'>, string> = {
  online: '#4ade80',
  unavailable: '#facc15',
  offline: '#6b7280',
};

export function UserPanel() {
  const { t } = useTranslation();
  const client = getMatrixClientOrNull();
  const userId = useAtomValue(userIdAtom);
  const [, setSettingsOpen] = useAtom(settingsOpenAtom);
  const setSettingsPage = useSetAtom(settingsPageAtom);
  const streamer = useStreamerMode();
  const ownPresence = useAtomValue(ownPresenceAtom);
  const [presenceOverride, setPresenceOverride] = useAtom(presenceOverrideAtom);
  const setProfile = useSetAtom(userProfileAtom);
  const panelRef = useRef<HTMLDivElement>(null);
  const { openContextMenu } = useContextMenu();
  const { micMuted, deafened, toggleMic, toggleDeafen } = useGlobalVoiceState();
  const callSnapshot = useCallSnapshot();
  const speaking =
    callSnapshot?.phase === 'joined' &&
    !!callSnapshot.participants.find((p) => p.isLocal)?.speaking;

  const { data: user } = useProfile(userId);
  const displayName = user?.displayName ?? '';
  const avatarMxc = user?.avatarUrl ?? null;
  const statusText = useUserStatusText(client, userId);
  const openStatusDialog = useSetAtom(customStatusDialogOpenAtom);
  const presenceUnsupported = useAtomValue(presenceSupportAtom) === 'unsupported';
  const confirmDialog = useConfirm();

  const openOwnProfile = useCallback(() => {
    if (!userId) return;
    const anchor = panelRef.current;
    if (!anchor) return;
    const rect = anchor.getBoundingClientRect();
    setProfile({
      userId,
      roomId: null,
      anchorRect: { top: rect.top, left: rect.left, width: rect.width, height: rect.height },
      placement: 'top',
      source: 'userpanel',
    });
  }, [userId, setProfile]);

  const MicIcon = micMuted ? MicrophoneSlashIcon : MicrophoneIcon;
  const micTitle = micMuted ? t('voice.unmute') : t('voice.mute');
  const deafenTitle = deafened ? t('voice.undeafen') : t('voice.deafen');

  const syncReady = useSyncReady();
  const presence: PresenceState | undefined = syncReady ? ownPresence : undefined;

  const handlePresenceDotClick = useCallback(
    (e: React.MouseEvent) => {
      const dotIcon = (state: Exclude<PresenceOverride, 'auto'>) => (
        <span
          style={{
            width: 10,
            height: 10,
            borderRadius: '50%',
            backgroundColor: PRESENCE_DOT_COLOR[state],
          }}
        />
      );
      const serverName = userId?.split(':').slice(1).join(':') ?? '';
      const items: ContextMenuItem[] = [
        ...(!presenceUnsupported
          ? []
          : [
              {
                label: t('presence.unsupported'),
                icon: <WarningCircleIcon size={16} />,
                danger: true,
                chevron: true,
                onClick: () =>
                  void confirmDialog({
                    title: t('presence.unsupportedTitle'),
                    message: t('presence.unsupportedMessage', { server: serverName }),
                    alert: true,
                  }),
              },
              { label: '', divider: true, onClick: () => {} },
            ]),
        {
          label: t('presence.auto'),
          icon: (
            <span
              style={{
                width: 10,
                height: 10,
                borderRadius: '50%',
                border: '2px solid currentColor',
              }}
            />
          ),
          checked: presenceOverride === 'auto',
          onClick: () => setPresenceOverride('auto'),
        },
        {
          label: t('presence.online'),
          icon: dotIcon('online'),
          checked: presenceOverride === 'online',
          onClick: () => setPresenceOverride('online'),
        },
        {
          label: t('presence.away'),
          icon: dotIcon('unavailable'),
          checked: presenceOverride === 'unavailable',
          onClick: () => setPresenceOverride('unavailable'),
        },
        {
          label: t('presence.offline'),
          icon: dotIcon('offline'),
          checked: presenceOverride === 'offline',
          onClick: () => setPresenceOverride('offline'),
        },
        { label: '', divider: true, onClick: () => {} },
        {
          label: statusText ? t('status.editCustomStatus') : t('status.setCustomStatus'),
          icon: <ChatCircleDotsIcon size={16} />,
          onClick: () => openStatusDialog(true),
        },
      ];
      openContextMenu(e, items);
    },
    [
      t,
      presenceOverride,
      setPresenceOverride,
      openContextMenu,
      statusText,
      openStatusDialog,
      presenceUnsupported,
      confirmDialog,
      userId,
    ]
  );

  return (
    <div ref={panelRef} className={css.userPanel}>
      <div
        className={css.userPanelIdentity}
        onClick={userId ? openOwnProfile : undefined}
        onContextMenu={userId ? handlePresenceDotClick : undefined}
        role={userId ? 'button' : undefined}
        tabIndex={userId ? 0 : undefined}
        onKeyDown={(e) => {
          if (!userId) return;
          if (e.key !== 'Enter' && e.key !== ' ') return;
          e.preventDefault();
          openOwnProfile();
        }}
      >
        <span className={speaking ? css.avatarRingSpeaking : css.avatarRing}>
          <Avatar
            name={displayName}
            mxcUrl={avatarMxc}
            client={client ?? undefined}
            size="sm"
            placeholder="logo"
            presence={presence}
            presenceDotLabel={t('presence.changeStatus')}
            onPresenceDotClick={handlePresenceDotClick}
          />
        </span>
        <span className={css.userPanelText}>
          <span className={css.userPanelId}>{displayName}</span>
          {statusText && <span className={css.userPanelStatus}>{statusText}</span>}
        </span>
      </div>
      <div className={css.voiceControls}>
        {streamer && (
          <IconButton
            size="sm"
            tooltip={t('settings.privacy.streamer.indicator')}
            aria-label={t('settings.privacy.streamer.indicator')}
            onClick={() => {
              setSettingsPage('privacy');
              setSettingsOpen(true);
            }}
          >
            <EyeSlashIcon size={16} />
          </IconButton>
        )}
        <DeviceControl kinds={['audioinput']} label={t('call.inputSettings')} variant="panel">
          <IconButton
            size="sm"
            danger={micMuted}
            tooltip={micTitle}
            aria-label={micTitle}
            onClick={toggleMic}
          >
            <PushToTalkDot>
              <MicIcon size={16} />
            </PushToTalkDot>
          </IconButton>
        </DeviceControl>
        <DeviceControl kinds={['audiooutput']} label={t('call.outputSettings')} variant="panel">
          <IconButton
            size="sm"
            danger={deafened}
            tooltip={deafenTitle}
            aria-label={deafenTitle}
            onClick={toggleDeafen}
          >
            <span className={css.deafenStrike}>
              <HeadphonesIcon size={16} />
              {deafened && (
                <span className={css.deafenStrikeSlash}>
                  <span className={css.deafenStrikeOutline} />
                  <span className={css.deafenStrikeCore} />
                </span>
              )}
            </span>
          </IconButton>
        </DeviceControl>
        <IconButton
          size="sm"
          tooltip={t('settings.userSettings')}
          aria-label={t('settings.userSettings')}
          onClick={() => setSettingsOpen(true)}
        >
          <GearIcon size={16} />
        </IconButton>
      </div>
    </div>
  );
}
