import { useAtom } from 'jotai';
import { useTranslation } from 'react-i18next';
import {
  typingIndicatorsAtom,
  sendReadReceiptsAtom,
  showPresenceAtom,
  mediaVisibilityAtom,
  type MediaVisibility,
} from '@/app/store/atoms';
import { ToggleRow } from '@/app/components/Toggle';
import { Select } from '@/app/components/Select';
import { ArrowCounterClockwiseIcon } from '@phosphor-icons/react';
import { Avatar } from '@/app/components/Avatar';
import { IconButton } from '@/app/components/Button';
import { useIgnoredUsers, useUnignoreUser } from '@/app/hooks/useIgnoredUsers';
import { getMatrixClientOrNull } from '@/client/initMatrix';
import { formatUserId } from '@/util/matrix';
import * as css from '../Settings.css';

const MEDIA_VISIBILITY_OPTIONS: Record<MediaVisibility, string> = {
  always: 'settings.privacy.mediaVisibilityAlways',
  private: 'settings.privacy.mediaVisibilityPrivate',
  never: 'settings.privacy.mediaVisibilityNever',
};

export function Privacy() {
  const { t } = useTranslation();
  const [typingIndicators, setTypingIndicators] = useAtom(typingIndicatorsAtom);
  const [sendReadReceipts, setSendReadReceipts] = useAtom(sendReadReceiptsAtom);
  const [showPresence, setShowPresence] = useAtom(showPresenceAtom);
  const [mediaVisibility, setMediaVisibility] = useAtom(mediaVisibilityAtom);

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
        <h3 className={css.sectionTitle}>{t('settings.privacy.media')}</h3>

        <div className={css.settingRow}>
          <div className={css.settingInfo}>
            <span className={css.settingLabel}>{t('settings.privacy.mediaVisibility')}</span>
          </div>
          <Select
            aria-label={t('settings.privacy.mediaVisibility')}
            value={mediaVisibility}
            options={Object.entries(MEDIA_VISIBILITY_OPTIONS).map(([option, labelKey]) => ({
              value: option,
              label: t(labelKey),
            }))}
            onChange={(v) => setMediaVisibility(v as MediaVisibility)}
          />
        </div>
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
      </div>

      <div className={css.divider} />

      <IgnoredUsers />
    </div>
  );
}

function IgnoredUsers() {
  const { t } = useTranslation();
  const client = getMatrixClientOrNull();
  const ignored = useIgnoredUsers(client);
  const unignore = useUnignoreUser(client);

  return (
    <div className={css.section}>
      <h3 className={css.sectionTitle}>{t('settings.privacy.ignoredUsers')}</h3>
      {ignored.length === 0 ? (
        <div className={css.noResults}>{t('settings.privacy.noIgnoredUsers')}</div>
      ) : (
        ignored.map((userId) => {
          const user = client?.getUser(userId);
          const name = user?.displayName || formatUserId(userId);
          return (
            <div key={userId} className={css.permRow}>
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
                onClick={() => void unignore(userId, name)}
              >
                <ArrowCounterClockwiseIcon size={14} />
              </IconButton>
            </div>
          );
        })
      )}
    </div>
  );
}
