import { useState, useLayoutEffect, useCallback, Fragment } from 'react';
import { PANEL_OVERLAY_QUERY } from '@/const/breakpoints';
import { useMediaQuery } from '@/app/hooks/useMediaQuery';
import { useAtom } from 'jotai';
import { useTranslation } from 'react-i18next';
import { Tooltip } from '@/app/components/Tooltip';
import {
  SlidersIcon,
  ListBulletsIcon,
  UsersIcon,
  ShieldIcon,
  TagIcon,
  SmileyStickerIcon,
  SparkleIcon,
  XIcon,
  type Icon as PhosphorIcon,
} from '@phosphor-icons/react';
import { spaceSettingsRoomIdAtom } from '@/app/store/atoms';
import { getMatrixClientOrNull } from '@/client/initMatrix';
import { useRoomDetails, useSpaceGraph } from '@/app/data';
import { Dialog } from '@/app/components/Dialog/Dialog';
import { GeneralPanel } from './General';
import { ChannelsPanel } from './ChannelsPanel';
import { RolesPanel } from './RolesPanel';
import { MatrixRoomsPanel } from './MatrixRoomsPanel';
import { useSpaceListStyle } from '../spaceListStyle';
import { PermissionsPanel } from '@/app/features/room/roomsettings/Permissions';
import { RoomPermissionsMatrix } from '@/app/features/room/roomsettings/RoomPermissionsMatrix';
import { EmojiStickerPanel } from '@/app/features/room/roomsettings/EmojiStickerPanel';
import * as css from '@/app/components/Settings/Settings.css';
import { zIndex } from '@/theme/zIndex';

type Tab = 'general' | 'channels' | 'members' | 'roles' | 'permissions' | 'emojis' | 'cosmetics';

const NAV: { tab: Tab; labelKey: string; Icon: PhosphorIcon }[] = [
  { tab: 'general', labelKey: 'room.settings.general.title', Icon: SlidersIcon },
  { tab: 'channels', labelKey: 'room.settings.channels.title', Icon: ListBulletsIcon },
  { tab: 'members', labelKey: 'common.members', Icon: UsersIcon },
  { tab: 'roles', labelKey: 'room.settings.roles.title', Icon: TagIcon },
  {
    tab: 'permissions',
    labelKey: 'room.settings.permissions.title',
    Icon: ShieldIcon,
  },
  {
    tab: 'emojis',
    labelKey: 'room.settings.emojis.title',
    Icon: SmileyStickerIcon,
  },
  {
    tab: 'cosmetics',
    labelKey: 'room.settings.cosmetics.title',
    Icon: SparkleIcon,
  },
];

export function SpaceSettings() {
  const { t } = useTranslation();
  const [spaceId, setSpaceId] = useAtom(spaceSettingsRoomIdAtom);
  const client = getMatrixClientOrNull();
  const [activeTab, setActiveTab] = useState<Tab>('general');
  const isNarrow = useMediaQuery(PANEL_OVERLAY_QUERY);

  const graph = useSpaceGraph();
  const details = useRoomDetails(spaceId);
  const space = spaceId && graph.some((s) => s.spaceId === spaceId) ? (details ?? null) : null;

  // Roles belong to the Modern room list style.
  const modern = useSpaceListStyle(spaceId) === 'modern';
  const nav = NAV.filter((item) => item.tab !== 'roles' || modern);
  // The Roles tab goes away when the style changes under it; fall back to the first tab.
  const tab = nav.some((item) => item.tab === activeTab) ? activeTab : 'general';

  useLayoutEffect(() => {
    if (spaceId) setActiveTab('general');
  }, [spaceId]);

  const close = useCallback(() => setSpaceId(null), [setSpaceId]);

  const valid = Boolean(spaceId && space);

  return (
    <Dialog
      open={Boolean(spaceId)}
      onClose={close}
      size="xl"
      zIndex={zIndex.modal}
      maxWidth="900px"
      height="640px"
      surface="primary"
      fullscreenOnMobile
      bodyClassName={css.dialogBody}
      ariaLabel={t('common.settings')}
    >
      {valid ? (
        <>
          <nav className={css.nav}>
            <span className={css.navLabel}>{t('common.settings')}</span>
            {nav.map((item) => {
              const isActive = tab === item.tab;
              return (
                <Fragment key={item.tab}>
                  {isNarrow ? (
                    <Tooltip content={t(item.labelKey)} placement="right">
                      <button
                        type="button"
                        className={isActive ? css.navItemActive : css.navItem}
                        onClick={() => setActiveTab(item.tab)}
                      >
                        <item.Icon size={16} weight={isActive ? 'fill' : 'regular'} />
                        <span className={css.navLabelText}>{t(item.labelKey)}</span>
                      </button>
                    </Tooltip>
                  ) : (
                    <button
                      type="button"
                      className={isActive ? css.navItemActive : css.navItem}
                      onClick={() => setActiveTab(item.tab)}
                    >
                      <item.Icon size={16} weight={isActive ? 'fill' : 'regular'} />
                      <span className={css.navLabelText}>{t(item.labelKey)}</span>
                    </button>
                  )}
                </Fragment>
              );
            })}
          </nav>

          <div className={css.content}>
            <button
              type="button"
              className={css.closeBtn}
              onClick={close}
              aria-label={t('common.close')}
            >
              <XIcon size={18} />
            </button>
            <div className={css.scroller}>
              {tab === 'general' && <GeneralPanel spaceId={spaceId!} />}
              {tab === 'channels' &&
                (modern ? (
                  <ChannelsPanel spaceId={spaceId!} />
                ) : (
                  <MatrixRoomsPanel spaceId={spaceId!} />
                ))}
              {tab === 'members' && <PermissionsPanel roomId={spaceId!} />}
              {tab === 'roles' && modern && <RolesPanel spaceId={spaceId!} />}
              {tab === 'permissions' && space && <RoomPermissionsMatrix roomId={spaceId!} />}
              {tab === 'emojis' && space && client && (
                <EmojiStickerPanel roomId={spaceId!} client={client} />
              )}
              {tab === 'cosmetics' && space && client && (
                <EmojiStickerPanel roomId={spaceId!} client={client} />
              )}
            </div>
          </div>
        </>
      ) : null}
    </Dialog>
  );
}
