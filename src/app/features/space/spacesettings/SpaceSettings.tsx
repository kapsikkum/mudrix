import { useState, useLayoutEffect, useCallback } from 'react';
import { useAtom } from 'jotai';
import { useTranslation } from 'react-i18next';
import {
  SlidersIcon,
  UsersIcon,
  ShieldIcon,
  SmileyStickerIcon,
  XIcon,
  type Icon as PhosphorIcon,
} from '@phosphor-icons/react';
import { spaceSettingsRoomIdAtom } from '@/app/store/atoms';
import { getMatrixClientOrNull } from '@/client/initMatrix';
import { Dialog } from '@/app/components/Dialog/Dialog';
import { GeneralPanel } from './General';
import { PermissionsPanel } from '@/app/features/room/roomsettings/Permissions';
import { RoomPermissionsMatrix } from '@/app/features/room/roomsettings/RoomPermissionsMatrix';
import { EmojiStickerPanel } from '@/app/features/room/roomsettings/EmojiStickerPanel';
import { NarrowSettingsList, NarrowSettingsPage } from '@/app/components/Settings/NarrowSettings';
import { useMediaQuery } from '@/app/hooks/useMediaQuery';
import * as css from '@/app/components/Settings/Settings.css';

type Tab = 'general' | 'members' | 'permissions' | 'emojis';

const NAV: { tab: Tab; labelKey: string; Icon: PhosphorIcon }[] = [
  { tab: 'general', labelKey: 'room.settings.general.title', Icon: SlidersIcon },
  { tab: 'members', labelKey: 'common.members', Icon: UsersIcon },
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
];

export function SpaceSettings() {
  const { t } = useTranslation();
  const [spaceId, setSpaceId] = useAtom(spaceSettingsRoomIdAtom);
  const client = getMatrixClientOrNull();
  const [activeTab, setActiveTab] = useState<Tab>('general');
  const isNarrow = useMediaQuery('(max-width: 768px)');
  const [narrowView, setNarrowView] = useState<'list' | 'page'>('list');
  const backToList = useCallback(() => setNarrowView('list'), []);

  const space = spaceId && client ? client.getRoom(spaceId) : null;

  useLayoutEffect(() => {
    if (spaceId) {
      setActiveTab('general');
      setNarrowView('list');
    }
  }, [spaceId]);

  const close = useCallback(() => setSpaceId(null), [setSpaceId]);

  const valid = Boolean(spaceId && space && space.getMyMembership() === 'join');

  const showPage = isNarrow && narrowView === 'page';
  const openTab = (tab: Tab) => {
    setActiveTab(tab);
    setNarrowView('page');
  };
  const panel = (
    <>
      {activeTab === 'general' && <GeneralPanel spaceId={spaceId!} />}
      {activeTab === 'members' && <PermissionsPanel roomId={spaceId!} />}
      {activeTab === 'permissions' && space && <RoomPermissionsMatrix room={space} />}
      {activeTab === 'emojis' && space && client && (
        <EmojiStickerPanel roomId={spaceId!} client={client} />
      )}
    </>
  );

  return (
    <Dialog
      open={Boolean(spaceId)}
      onClose={showPage ? backToList : close}
      size="xl"
      zIndex={7000}
      maxWidth="900px"
      height="640px"
      surface="primary"
      fullscreenOnMobile
      bodyClassName={isNarrow ? `${css.dialogBody} ${css.dialogBodyColumn}` : css.dialogBody}
      ariaLabel={t('common.settings')}
    >
      {!valid ? null : isNarrow ? (
        showPage ? (
          <NarrowSettingsPage
            title={t(NAV.find((item) => item.tab === activeTab)?.labelKey ?? '')}
            onBack={backToList}
            onClose={close}
          >
            {panel}
          </NarrowSettingsPage>
        ) : (
          <NarrowSettingsList
            title={space?.name ?? t('common.settings')}
            items={NAV.map((item) => ({ key: item.tab, label: t(item.labelKey), Icon: item.Icon }))}
            onSelect={openTab}
            onClose={close}
          />
        )
      ) : (
        <>
          <nav className={css.nav}>
            <span className={css.navLabel}>{t('common.settings')}</span>
            {NAV.map((item) => {
              const isActive = activeTab === item.tab;
              return (
                <button
                  key={item.tab}
                  type="button"
                  className={isActive ? css.navItemActive : css.navItem}
                  onClick={() => setActiveTab(item.tab)}
                >
                  <item.Icon size={16} weight={isActive ? 'fill' : 'regular'} />
                  <span className={css.navLabelText}>{t(item.labelKey)}</span>
                </button>
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
            {panel}
          </div>
        </>
      )}
    </Dialog>
  );
}
