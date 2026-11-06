import { useTranslation } from 'react-i18next';
import { useClient, useSpaceGraph } from '@/app/data';
import { Select } from '@/app/components/Select';
import { ToggleRow } from '@/app/components/Toggle';
import { useToast } from '@/app/hooks/useToast';
import { useCanSendState } from '@/app/hooks/useCanSendState';
import { getErrorMessage } from '@/util/error';
import { SpaceBannerPicker } from '../SpaceBannerPicker';
import { SPACE_BANNER_STATE_TYPE } from '../spaceBanner';
import { SPACE_AUTO_JOIN_STATE_TYPE, setSpaceAutoJoin, useSpaceAutoJoin } from '../spaceAutoJoin';
import {
  SPACE_LIST_STYLE_STATE_TYPE,
  rootSpaceOf,
  setSpaceListStyle,
  useSpaceListStyle,
  type RoomListStyle,
} from '../spaceListStyle';
import * as css from '@/app/components/Settings/Settings.css';

/**
 * What a space has beyond Matrix: its banner, how its rooms are listed (Matrix or Modern) and
 * whether newcomers are joined to every room. All three are state events on the space, so staff
 * set them for everyone.
 */
export function SpaceModernSettings({ spaceId }: { spaceId: string }) {
  const { t } = useTranslation();
  const client = useClient();
  const toast = useToast();
  const graph = useSpaceGraph();
  const can = useCanSendState(spaceId);
  const listStyle = useSpaceListStyle(spaceId);
  const autoJoin = useSpaceAutoJoin(spaceId);
  // A space inside another one follows the style of the top space; it is set there.
  const styleInherited = rootSpaceOf(graph, spaceId) !== spaceId;
  const canSetListStyle = can(SPACE_LIST_STYLE_STATE_TYPE) && !styleInherited;

  const save = (change: () => Promise<void>) => {
    change().catch((err: unknown) =>
      toast.error(t('common.saveFailed', { error: getErrorMessage(err) }))
    );
  };

  return (
    <>
      <div className={css.section}>
        <SpaceBannerPicker
          client={client}
          spaceId={spaceId}
          canEdit={can(SPACE_BANNER_STATE_TYPE)}
        />
      </div>

      <div className={css.section}>
        <div className={css.settingRow}>
          <div className={css.settingInfo}>
            <span className={css.settingLabel}>{t('settings.appearance.roomListStyle')}</span>
            <span className={css.settingNote}>{t('settings.appearance.roomListStyleNote')}</span>
          </div>
          <Select<RoomListStyle>
            aria-label={t('settings.appearance.roomListStyle')}
            value={listStyle}
            options={[
              { value: 'matrix', label: t('settings.appearance.roomListStyleMatrix') },
              { value: 'modern', label: t('settings.appearance.roomListStyleModern') },
            ]}
            onChange={(style) => save(() => setSpaceListStyle(client, spaceId, style))}
            disabled={!canSetListStyle}
          />
        </div>
        <ToggleRow
          label={t('room.settings.general.autoJoin')}
          description={t('room.settings.general.autoJoinNote')}
          checked={autoJoin}
          onChange={(enabled) => save(() => setSpaceAutoJoin(client, spaceId, enabled))}
          disabled={!can(SPACE_AUTO_JOIN_STATE_TYPE)}
        />
      </div>
    </>
  );
}
