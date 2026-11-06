import { useState } from 'react';
import { useAtom } from 'jotai';
import { useTranslation } from 'react-i18next';
import {
  typingIndicatorsAtom,
  sendReadReceiptsAtom,
  showPresenceAtom,
  showHomeserverSoftwareAtom,
  streamerModeAtom,
  type StreamerMode,
} from '@/app/store/atoms';
import { ToggleRow } from '@/app/components/Toggle';
import { Select } from '@/app/components/Select';
import { ArrowCounterClockwiseIcon } from '@phosphor-icons/react';
import { Avatar } from '@/app/components/Avatar';
import { IconButton } from '@/app/components/Button';
import { useIgnoredUsers, useUnignoreUser } from '@/app/hooks/useIgnoredUsers';
import { useInviteBlocking } from '@/app/hooks/useInviteBlocking';
import { useToast } from '@/app/hooks/useToast';
import { getErrorMessage } from '@/util/error';
import { getMatrixClientOrNull } from '@/client/initMatrix';
import { useProfile } from '@/app/data';
import { formatUserId } from '@/util/matrix';
import * as css from '../Settings.css';

const STREAMER_OPTIONS: Record<StreamerMode, string> = {
  off: 'settings.privacy.streamer.off',
  auto: 'settings.privacy.streamer.auto',
  on: 'settings.privacy.streamer.on',
};

export function Privacy() {
  const { t } = useTranslation();
  const [typingIndicators, setTypingIndicators] = useAtom(typingIndicatorsAtom);
  const [sendReadReceipts, setSendReadReceipts] = useAtom(sendReadReceiptsAtom);
  const [showPresence, setShowPresence] = useAtom(showPresenceAtom);
  const [showHomeserverSoftware, setShowHomeserverSoftware] = useAtom(showHomeserverSoftwareAtom);
  const [streamerMode, setStreamerMode] = useAtom(streamerModeAtom);

  return (
    <div>
      <h2 className={css.panelTitle}>{t('settings.privacy.title')}</h2>

      <div className={css.section}>
        <h3 className={css.sectionTitle}>{t('settings.privacy.chat')}</h3>

        <ToggleRow
          label={t('settings.privacy.typingIndicators')}
          description={t('settings.privacy.typingIndicatorsNote')}
          checked={typingIndicators}
          onChange={setTypingIndicators}
        />
        <ToggleRow
          label={t('settings.privacy.sendReadReceipts')}
          description={t('settings.privacy.sendReadReceiptsNote')}
          checked={sendReadReceipts}
          onChange={setSendReadReceipts}
        />
      </div>

      <div className={css.divider} />

      <div className={css.section}>
        <h3 className={css.sectionTitle}>{t('settings.privacy.other')}</h3>

        <ToggleRow
          label={t('settings.privacy.showPresence')}
          description={t('settings.privacy.showPresenceNote')}
          checked={showPresence}
          onChange={setShowPresence}
        />
        <ToggleRow
          label={t('settings.privacy.showHomeserverSoftware')}
          description={t('settings.privacy.showHomeserverSoftwareNote')}
          checked={showHomeserverSoftware}
          onChange={setShowHomeserverSoftware}
        />
        <BlockInvitesToggle />
      </div>

      <div className={css.divider} />

      <div className={css.section}>
        <h3 className={css.sectionTitle}>{t('settings.privacy.streamer.title')}</h3>
        <div className={css.settingRow}>
          <div className={css.settingInfo}>
            <span className={css.settingLabel}>{t('settings.privacy.streamer.mode')}</span>
            <span className={css.settingNote}>{t('settings.privacy.streamer.note')}</span>
          </div>
          <Select
            aria-label={t('settings.privacy.streamer.mode')}
            value={streamerMode}
            options={Object.entries(STREAMER_OPTIONS).map(([option, labelKey]) => ({
              value: option,
              label: t(labelKey),
            }))}
            onChange={(v) => setStreamerMode(v as StreamerMode)}
          />
        </div>
      </div>

      <div className={css.divider} />

      <IgnoredUsers />
    </div>
  );
}

function BlockInvitesToggle() {
  const { t } = useTranslation();
  const toast = useToast();
  const { supported, blocked, setBlocked } = useInviteBlocking(getMatrixClientOrNull());
  const [pending, setPending] = useState<boolean | null>(null);

  if (!supported) return null;

  return (
    <ToggleRow
      label={t('settings.privacy.blockInvites')}
      description={t('settings.privacy.blockInvitesNote')}
      checked={pending ?? blocked}
      onChange={async (next) => {
        setPending(next);
        try {
          await setBlocked(next);
        } catch (err) {
          toast.error(t('settings.privacy.blockInvitesFailed', { error: getErrorMessage(err) }));
        } finally {
          setPending(null);
        }
      }}
    />
  );
}

function IgnoredUsers() {
  const { t } = useTranslation();
  const ignored = useIgnoredUsers();
  const unignore = useUnignoreUser();

  return (
    <div className={css.section}>
      <h3 className={css.sectionTitle}>{t('settings.privacy.ignoredUsers')}</h3>
      {ignored.length === 0 ? (
        <div className={css.noResults}>{t('settings.privacy.noIgnoredUsers')}</div>
      ) : (
        ignored.map((userId) => (
          <IgnoredUserRow key={userId} userId={userId} onUnignore={unignore} />
        ))
      )}
    </div>
  );
}

function IgnoredUserRow({
  userId,
  onUnignore,
}: {
  userId: string;
  onUnignore: (userId: string, displayName: string) => Promise<void>;
}) {
  const { t } = useTranslation();
  const client = getMatrixClientOrNull();
  const { data: user } = useProfile(userId);
  const name = user?.displayName || formatUserId(userId);
  return (
    <div className={css.permRow}>
      <Avatar
        name={name}
        mxcUrl={user?.avatarUrl}
        client={client ?? undefined}
        size="sm"
        placeholder="logo"
      />
      <div className={css.permRowName}>
        <div>{name}</div>
        <div className={css.permRowId}>{userId}</div>
      </div>
      <IconButton
        size="xs"
        tooltip={t('profile.unignoreUser')}
        aria-label={t('profile.unignoreUser')}
        onClick={() => void onUnignore(userId, name)}
      >
        <ArrowCounterClockwiseIcon size={14} />
      </IconButton>
    </div>
  );
}
