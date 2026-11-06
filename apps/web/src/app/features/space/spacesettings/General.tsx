import { useAtom } from 'jotai';
import { useTranslation } from 'react-i18next';
import { developerModeAtom } from '@/app/store/atoms';
import { CopyButton } from '@/app/components/Button';
import { Select } from '@/app/components/Select';
import { SoundboardRoomSettings } from '@/app/features/soundboard/SoundboardRoomSettings';
import { AddressesSection } from '@/app/features/room/roomsettings/AddressesSection';
import { IdentitySection } from '@/app/features/room/roomsettings/IdentitySection';
import {
  useIdentityForm,
  type AccessOption,
} from '@/app/features/room/roomsettings/useIdentityForm';
import { useRoomAliases } from '@/app/features/room/roomsettings/useRoomAliases';
import { SpaceModernSettings } from './SpaceModernSettings';
import * as css from '@/app/components/Settings/Settings.css';

interface GeneralPanelProps {
  spaceId: string;
}

export function GeneralPanel({ spaceId }: GeneralPanelProps) {
  const { t } = useTranslation();
  const [devModeEnabled] = useAtom(developerModeAtom);
  const identity = useIdentityForm({ roomId: spaceId, restrictedAllowRoomId: null });
  const aliases = useRoomAliases(spaceId);

  return (
    <div>
      <h2 className={css.panelTitle}>{t('room.settings.general.title')}</h2>

      <SpaceModernSettings spaceId={spaceId} />

      <IdentitySection
        form={identity}
        nameLabel={t('room.space.name')}
        namePlaceholder={t('room.space.namePlaceholder')}
      />

      <div className={css.divider} />

      <div className={css.section}>
        <h3 className={css.sectionTitle}>{t('room.settings.security.title')}</h3>

        <div className={css.settingRow}>
          <div className={css.settingInfo}>
            <span className={css.settingLabel}>{t('room.settings.security.access')}</span>
          </div>
          <Select
            aria-label={t('room.settings.security.access')}
            value={identity.access}
            disabled={!identity.canSetJoinRules}
            options={[
              { value: 'invite', label: t('room.settings.security.accessInviteSpace') },
              { value: 'knock', label: t('room.settings.security.accessKnock') },
              { value: 'public', label: t('room.settings.security.accessPublic') },
            ]}
            onChange={(v) => identity.setAccess(v as AccessOption)}
          />
        </div>
      </div>

      {devModeEnabled && (
        <>
          <div className={css.divider} />

          <div className={css.section}>
            <h3 className={css.sectionTitle}>{t('room.space.settings.general.spaceId')}</h3>
            <div className={css.tokenRow}>
              <code className={css.tokenField}>{spaceId}</code>
              <CopyButton text={spaceId} />
            </div>
          </div>
        </>
      )}

      <div className={css.divider} />

      <AddressesSection aliases={aliases} />

      <SoundboardRoomSettings roomId={spaceId} />
    </div>
  );
}
