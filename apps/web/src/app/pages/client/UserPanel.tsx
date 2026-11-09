import { useCallback, useEffect, useRef, useState } from 'react';
import {
  EyeSlashIcon,
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
  settingsPageAtom,
  userIdAtom,
  showPresenceAtom,
  ownPresenceAtom,
  userProfileAtom,
} from '@/app/store/atoms';
import { useStreamerMode } from '@/app/hooks/useStreamerMode';
import { useSyncReady } from '@/app/hooks/useSync';
import { useGlobalVoiceState } from '@/app/features/voice/useGlobalVoice';
import { DeviceControl } from '@/app/features/calls/DeviceMenu';
import { PushToTalkDot } from '@/app/features/calls/PushToTalkDot';
import { useCallSnapshot } from '@/app/features/calls/stage/useCallSnapshot';
import { getMatrixClientOrNull } from '@/client/initMatrix';
import { useProfile } from '@/app/data';
import {
  useActiveStatus,
  useExtendedProfile,
  useExtendedProfileMutations,
} from '@/app/hooks/useExtendedProfile';
import { CustomStatusModal } from '@/app/features/profile/CustomStatusModal';
import { DecoratedAvatar } from '@/app/features/profile/ProfileCosmetics';
import { effectiveDotPresence } from '@/util/profileCosmetics';
import { UserStatusMenu } from './UserStatusMenu';
import * as css from './UserPanel.css';

export function UserPanel() {
  const { t } = useTranslation();
  const client = getMatrixClientOrNull();
  const userId = useAtomValue(userIdAtom);
  const [, setSettingsOpen] = useAtom(settingsOpenAtom);
  const setSettingsPage = useSetAtom(settingsPageAtom);
  const streamer = useStreamerMode();
  const showPresence = useAtomValue(showPresenceAtom);
  const ownPresence = useAtomValue(ownPresenceAtom);
  const setProfile = useSetAtom(userProfileAtom);
  const panelRef = useRef<HTMLDivElement>(null);
  const identityRef = useRef<HTMLDivElement>(null);
  const { micMuted, deafened, toggleMic, toggleDeafen } = useGlobalVoiceState();
  const callSnapshot = useCallSnapshot();
  const speaking =
    callSnapshot?.phase === 'joined' &&
    !!callSnapshot.participants.find((p) => p.isLocal)?.speaking;
  const [statusOpen, setStatusOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const { data: ownFields } = useExtendedProfile(client, userId);
  const { saveFields } = useExtendedProfileMutations(client);
  const ownStatus = useActiveStatus(ownFields?.status);

  const { data: user } = useProfile(userId);
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
  const presence = hasPresence ? effectiveDotPresence(ownPresence, ownStatus?.mode) : undefined;

  // Clear a status client-side once its "clear after" time passes (also checked on startup,
  // when a stale value may still be stored in the profile).
  const rawStatus = ownFields?.status ?? null;
  const rawExpiry = rawStatus?.expiresAt ?? null;
  useEffect(() => {
    if (rawExpiry === null) return;
    const clear = () => {
      saveFields({ status: null }).catch(() => {});
    };
    const delay = rawExpiry - Date.now();
    if (delay <= 0) {
      clear();
      return;
    }
    const id = window.setTimeout(clear, Math.min(delay, 2 ** 31 - 1));
    return () => window.clearTimeout(id);
    // saveFields is a fresh closure each render; only the expiry should re-arm the timer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawExpiry]);

  return (
    <div ref={panelRef} className={css.userPanel}>
      <div
        ref={identityRef}
        className={css.userPanelIdentity}
        onClick={userId ? () => setMenuOpen((v) => !v) : undefined}
        onContextMenu={(e) => {
          if (!userId) return;
          e.preventDefault();
          setMenuOpen(true);
        }}
        role={userId ? 'button' : undefined}
        aria-haspopup={userId ? 'menu' : undefined}
        aria-expanded={userId ? menuOpen : undefined}
        tabIndex={userId ? 0 : undefined}
        onKeyDown={(e) => {
          if (!userId) return;
          if (e.key !== 'Enter' && e.key !== ' ') return;
          e.preventDefault();
          setMenuOpen((v) => !v);
        }}
      >
        <span className={speaking ? css.avatarRingSpeaking : css.avatarRing}>
          <DecoratedAvatar decoration={ownFields?.avatarDecoration ?? null} client={client}>
            <Avatar
              name={displayName}
              mxcUrl={avatarMxc}
              client={client ?? undefined}
              size="sm"
              placeholder="logo"
              presence={presence}
            />
          </DecoratedAvatar>
        </span>
        <span className={css.userPanelId}>
          {displayName}
          {ownStatus?.emoji ? ` ${ownStatus.emoji}` : ''}
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
      <UserStatusMenu
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        anchorRef={identityRef}
        onViewProfile={openOwnProfile}
        onEditStatus={() => setStatusOpen(true)}
      />
      <CustomStatusModal open={statusOpen} onClose={() => setStatusOpen(false)} />
    </div>
  );
}
