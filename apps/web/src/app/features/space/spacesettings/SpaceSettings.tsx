import { useState, useLayoutEffect, useCallback, useRef } from 'react';
import { useAtom } from 'jotai';
import { useTranslation } from 'react-i18next';
import { zIndex } from '@/theme/zIndex';
import {
  SlidersIcon,
  ListBulletsIcon,
  UsersIcon,
  ShieldIcon,
  TagIcon,
  SmileyStickerIcon,
  ClockCounterClockwiseIcon,
  XIcon,
  type Icon as PhosphorIcon,
} from '@phosphor-icons/react';
import { spaceSettingsRoomIdAtom } from '@/app/store/atoms';
import { getMatrixClientOrNull } from '@/client/initMatrix';
import {
  powerLevelOf,
  useRoomDetails,
  useRoomSettings,
  useSpaceGraph,
  useUserId,
} from '@/app/data';
import { Dialog } from '@/app/components/Dialog/Dialog';
import { GeneralPanel } from './General';
import { ChannelsPanel } from './ChannelsPanel';
import { RolesPanel } from './RolesPanel';
import { MatrixRoomsPanel } from './MatrixRoomsPanel';
import { useSpaceListStyle } from '../spaceListStyle';
import { PermissionsPanel } from '@/app/features/room/roomsettings/Permissions';
import { RoomPermissionsMatrix } from '@/app/features/room/roomsettings/RoomPermissionsMatrix';
import { EmojiStickerPanel } from '@/app/features/room/roomsettings/EmojiStickerPanel';
import { AuditLogPanel } from '@/app/features/room/roomsettings/AuditLog';
import { NarrowSettingsList, NarrowSettingsPage } from '@/app/components/Settings/NarrowSettings';
import {
  SettingsSearchInput,
  SettingsSearchResults,
  useHighlightSetting,
  useSettingsSearch,
  type SettingsSearchResult,
} from '@/app/components/Settings/SettingsSearch';
import {
  SPACE_SETTINGS_INDEX,
  type SpaceSettingsTab,
} from '@/app/features/room/roomsettings/searchIndex';
import { useMediaQuery } from '@/app/hooks/useMediaQuery';
import * as css from '@/app/components/Settings/Settings.css';

type Tab = SpaceSettingsTab | 'channels' | 'roles' | 'audit';

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
    tab: 'audit',
    labelKey: 'room.settings.auditLog.title',
    Icon: ClockCounterClockwiseIcon,
  },
];

export function SpaceSettings() {
  const { t } = useTranslation();
  const [spaceId, setSpaceId] = useAtom(spaceSettingsRoomIdAtom);
  const client = getMatrixClientOrNull();
  const [selectedTab, setActiveTab] = useState<Tab>('general');
  const isNarrow = useMediaQuery('(max-width: 768px)');
  const [narrowView, setNarrowView] = useState<'list' | 'page'>('list');
  const backToList = useCallback(() => setNarrowView('list'), []);
  const [query, setQuery] = useState('');
  const [highlight, setHighlight] = useState<string | null>(null);
  const pageRef = useRef<HTMLDivElement>(null);
  const clearHighlight = useCallback(() => setHighlight(null), []);
  useHighlightSetting(pageRef, highlight, clearHighlight);

  const graph = useSpaceGraph();
  const details = useRoomDetails(spaceId);
  const space = spaceId && graph.some((s) => s.spaceId === spaceId) ? (details ?? null) : null;

  // Roles belong to the Modern room list style; a Matrix style space has the plain room list.
  const modern = useSpaceListStyle(spaceId) === 'modern';
  // The history is visible to every member, but reading the audit log is a moderator's job.
  const myId = useUserId();
  const { data: auditSettings } = useRoomSettings(spaceId);
  const canAudit =
    !!auditSettings &&
    powerLevelOf(auditSettings.powerLevels, myId, auditSettings.creators) >=
      ((auditSettings.powerLevels?.kick as number | undefined) ?? 50);
  const nav = NAV.filter(
    (item) => (item.tab !== 'roles' || modern) && (item.tab !== 'audit' || canAudit)
  );
  // A tab goes away when the style changes under it; fall back to the first one.
  const activeTab = nav.some((item) => item.tab === selectedTab) ? selectedTab : 'general';
  const pages = nav.map((item) => ({ key: item.tab, label: t(item.labelKey), Icon: item.Icon }));
  const results = useSettingsSearch(pages, SPACE_SETTINGS_INDEX, query);

  useLayoutEffect(() => {
    if (spaceId) {
      setQuery('');
      setActiveTab('general');
      setNarrowView('list');
    }
  }, [spaceId]);

  const close = useCallback(() => setSpaceId(null), [setSpaceId]);

  const valid = Boolean(spaceId && space);

  const showPage = isNarrow && narrowView === 'page';
  const openTab = (tab: Tab) => {
    setActiveTab(tab);
    setNarrowView('page');
  };
  const openResult = (result: SettingsSearchResult<Tab>) => {
    openTab(result.page);
    setHighlight(result.pageLabel ? result.label : null);
  };
  const search = (className: string) => (
    <SettingsSearchInput
      className={className}
      value={query}
      onChange={setQuery}
      onSubmit={() => results?.[0] && openResult(results[0])}
    />
  );
  const panel = (
    <div ref={pageRef}>
      {activeTab === 'general' && <GeneralPanel spaceId={spaceId!} />}
      {activeTab === 'channels' &&
        (modern ? <ChannelsPanel spaceId={spaceId!} /> : <MatrixRoomsPanel spaceId={spaceId!} />)}
      {activeTab === 'members' && <PermissionsPanel roomId={spaceId!} />}
      {activeTab === 'roles' && modern && <RolesPanel spaceId={spaceId!} />}
      {activeTab === 'permissions' && space && <RoomPermissionsMatrix roomId={spaceId!} />}
      {activeTab === 'emojis' && space && client && (
        <EmojiStickerPanel roomId={spaceId!} client={client} />
      )}
      {activeTab === 'audit' && space && <AuditLogPanel roomId={spaceId!} />}
    </div>
  );

  return (
    <Dialog
      open={Boolean(spaceId)}
      onClose={showPage ? backToList : close}
      size="xl"
      zIndex={zIndex.modal}
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
            title={t(nav.find((item) => item.tab === activeTab)?.labelKey ?? '')}
            onBack={backToList}
            onClose={close}
          >
            {panel}
          </NarrowSettingsPage>
        ) : (
          <NarrowSettingsList
            title={space?.name ?? t('common.settings')}
            items={pages}
            onSelect={openTab}
            onClose={close}
            search={search(css.navListSearch)}
            results={
              results && <SettingsSearchResults results={results} onSelect={openResult} narrow />
            }
          />
        )
      ) : (
        <>
          <nav className={css.nav}>
            <span className={css.navLabel}>{t('common.settings')}</span>
            {search(css.navSearch)}
            {results ? (
              <SettingsSearchResults results={results} onSelect={openResult} />
            ) : (
              nav.map((item) => {
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
              })
            )}
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
