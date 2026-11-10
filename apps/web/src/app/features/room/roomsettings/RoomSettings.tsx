import { useState, useLayoutEffect, useCallback } from 'react';
import { useAtom, useAtomValue } from 'jotai';
import { useTranslation } from 'react-i18next';
import {
  SlidersIcon,
  PuzzlePieceIcon,
  UsersIcon,
  ShieldIcon,
  SmileyStickerIcon,
  SparkleIcon,
  ClockCounterClockwiseIcon,
  XIcon,
  type Icon as PhosphorIcon,
} from '@phosphor-icons/react';
import { roomSettingsRoomIdAtom, roomSettingsTabAtom, developerModeAtom } from '@/app/store/atoms';
import { getMatrixClientOrNull } from '@/client/initMatrix';
import { powerLevelOf, useRoom, useRoomSettings, useUserId } from '@/app/data';
import { Dialog } from '@/app/components/Dialog/Dialog';
import { GeneralPanel } from './General';
import { PermissionsPanel } from './Permissions';
import { RoomPermissionsMatrix } from './RoomPermissionsMatrix';
import { Widgets } from './Widgets';
import { EmojiStickerPanel } from './EmojiStickerPanel';
import { AuditLogPanel } from './AuditLog';
import { NarrowSettingsList, NarrowSettingsPage } from '@/app/components/Settings/NarrowSettings';
import { useMediaQuery } from '@/app/hooks/useMediaQuery';
import * as css from '@/app/components/Settings/Settings.css';

type Tab = 'general' | 'members' | 'permissions' | 'widgets' | 'emojis' | 'cosmetics' | 'audit';

const NAV: { tab: Tab; labelKey: string; Icon: PhosphorIcon }[] = [
  { tab: 'general', labelKey: 'room.settings.general.title', Icon: SlidersIcon },
  { tab: 'members', labelKey: 'common.members', Icon: UsersIcon },
  {
    tab: 'permissions',
    labelKey: 'room.settings.permissions.title',
    Icon: ShieldIcon,
  },
  {
    tab: 'widgets',
    labelKey: 'room.settings.widgets.title',
    Icon: PuzzlePieceIcon,
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
  {
    tab: 'audit',
    labelKey: 'room.settings.auditLog.title',
    Icon: ClockCounterClockwiseIcon,
  },
];

export function RoomSettings() {
  const { t } = useTranslation();
  const [roomId, setRoomId] = useAtom(roomSettingsRoomIdAtom);
  const [roomSettingsTab, setRoomSettingsTab] = useAtom(roomSettingsTabAtom);
  const developerMode = useAtomValue(developerModeAtom);
  const client = getMatrixClientOrNull();
  const [activeTab, setActiveTab] = useState<Tab>('general');
  const isNarrow = useMediaQuery('(max-width: 768px)');
  const [narrowView, setNarrowView] = useState<'list' | 'page'>('list');
  const backToList = useCallback(() => setNarrowView('list'), []);

  const room = useRoom(roomId);

  // The history is visible to every member, but reading the audit log is a moderator's job.
  const myId = useUserId();
  const { data: auditSettings } = useRoomSettings(roomId);
  const canAudit =
    !!auditSettings &&
    powerLevelOf(auditSettings.powerLevels, myId, auditSettings.creators) >=
      ((auditSettings.powerLevels?.kick as number | undefined) ?? 50);
  const navItems = NAV.filter(
    (item) => (developerMode || item.tab !== 'widgets') && (canAudit || item.tab !== 'audit')
  );
  const shownTab =
    (!developerMode && activeTab === 'widgets') || (!canAudit && activeTab === 'audit')
      ? 'general'
      : activeTab;

  useLayoutEffect(() => {
    if (roomId) {
      setActiveTab(roomSettingsTab ?? 'general');
      setNarrowView(roomSettingsTab ? 'page' : 'list');
      setRoomSettingsTab(null);
    }
  }, [roomId]); // eslint-disable-line react-hooks/exhaustive-deps

  const close = useCallback(() => setRoomId(null), [setRoomId]);

  const valid = Boolean(roomId) && Boolean(room && client) && !room?.isInvite;

  const showPage = isNarrow && narrowView === 'page';
  const openTab = (tab: Tab) => {
    setActiveTab(tab);
    setNarrowView('page');
  };
  const panel = (
    <>
      {shownTab === 'general' && <GeneralPanel roomId={roomId!} onClose={close} />}
      {shownTab === 'members' && <PermissionsPanel roomId={roomId!} />}
      {shownTab === 'permissions' && room && <RoomPermissionsMatrix roomId={roomId!} />}
      {shownTab === 'widgets' && <Widgets roomId={roomId!} client={client!} />}
      {shownTab === 'emojis' && <EmojiStickerPanel roomId={roomId!} client={client!} />}
      {shownTab === 'cosmetics' && <EmojiStickerPanel roomId={roomId!} client={client!} />}
      {shownTab === 'audit' && <AuditLogPanel roomId={roomId!} />}
    </>
  );

  return (
    <Dialog
      open={Boolean(roomId)}
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
            title={t(navItems.find((item) => item.tab === shownTab)?.labelKey ?? '')}
            onBack={backToList}
            onClose={close}
          >
            {panel}
          </NarrowSettingsPage>
        ) : (
          <NarrowSettingsList
            title={room?.name ?? t('common.settings')}
            items={navItems.map((item) => ({
              key: item.tab,
              label: t(item.labelKey),
              Icon: item.Icon,
            }))}
            onSelect={openTab}
            onClose={close}
          />
        )
      ) : (
        <>
          <nav className={css.nav}>
            <span className={css.navLabel}>{t('common.settings')}</span>
            {navItems.map((item) => {
              const isActive = shownTab === item.tab;
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
            <div className={css.scroller}>{panel}</div>
          </div>
        </>
      )}
    </Dialog>
  );
}
