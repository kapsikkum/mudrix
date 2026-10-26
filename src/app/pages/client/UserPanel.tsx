import { useCallback, useRef } from 'react';
import {
  GearIcon,
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
  userIdAtom,
  showPresenceAtom,
  ownPresenceAtom,
  presenceOverrideAtom,
  userProfileAtom,
} from '@/app/store/atoms';
import type { PresenceState, PresenceOverride } from '@/app/store/atoms';
import { useContextMenu } from '@/app/hooks/useContextMenu';
import { useSyncReady } from '@/app/hooks/useSync';
import type { ContextMenuItem } from '@/app/features/contextMenu/contextMenuAtom';
import { useGlobalVoiceState } from '@/app/features/voice/useGlobalVoice';
import { DeviceControl } from '@/app/features/calls/DeviceMenu';
import { PushToTalkDot } from '@/app/features/calls/PushToTalkDot';
import { useCallSnapshot } from '@/app/features/calls/stage/useCallSnapshot';
import { getMatrixClientOrNull } from '@/client/initMatrix';
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
  const showPresence = useAtomValue(showPresenceAtom);
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

  const user = client && userId ? client.getUser(userId) : null;
  const displayName = user?.displayName ?? '';
  const avatarMxc = user?.avatarUrl ?? null;

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
  const hasPresence = showPresence && syncReady;
  const presence: PresenceState | undefined = hasPresence ? ownPresence : undefined;

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
      const items: ContextMenuItem[] = [
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
      ];
      openContextMenu(e, items);
    },
    [t, presenceOverride, setPresenceOverride, openContextMenu]
  );

  return (
    <div ref={panelRef} className={css.userPanel}>
      <div
        className={css.userPanelIdentity}
        onClick={userId ? openOwnProfile : undefined}
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
            onPresenceDotClick={showPresence ? handlePresenceDotClick : undefined}
          />
        </span>
        <span className={css.userPanelId}>{displayName}</span>
      </div>
      <div className={css.voiceControls}>
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
