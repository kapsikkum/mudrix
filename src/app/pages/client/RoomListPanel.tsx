import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { CaretDownIcon, DotsThreeVerticalIcon, PlusIcon } from '@phosphor-icons/react';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Tooltip } from '@/app/components/Tooltip';
import { IconButton } from '@/app/components/Button';
import {
  currentRoomIdAtom,
  currentSpaceIdAtom,
  sidebarViewAtom,
  createRoomOpenAtom,
  newDmOpenAtom,
  closedNavCategoriesAtom,
  pinnedSubSpacesAtom,
  spaceSettingsRoomIdAtom,
  mobileDrawerOpenAtom,
  favouriteRoomsAtom,
  openRoomChatAtom,
} from '@/app/store/atoms';
import { useToast } from '@/app/hooks/useToast';
import { useContextMenu } from '@/app/hooks/useContextMenu';
import { useContextMenuTrigger } from '@/app/hooks/useContextMenuTrigger';
import { useDms } from '@/app/hooks/useDms';
import { useRooms, useSpaces } from '@/app/features/room';
import { useSpaceHierarchy } from '@/app/features/room/useSpaceHierarchy';
import type { RoomEntry } from '@/app/features/room/useRooms';
import type {
  HierarchyItem,
  HierarchyRoomItem,
  HierarchySpaceItem,
} from '@/app/features/room/useSpaceHierarchy';
import { CallBar } from '@/app/features/calls/CallBar';
import { callActionsAtom, callUiAtom, pendingCallRoomIdAtom } from '@/app/store/atoms/call';
import { useCallMemberships, uniqueMembers } from '@/app/features/calls/useCallMemberships';
import { computeParticipantsBlockHeight } from '@/app/features/voice/participantSize';
import { useUiDensitySizes } from '@/app/hooks/useUiDensitySync';
import { Avatar } from '@/app/components/Avatar';
import { getMatrixClientOrNull } from '@/client/initMatrix';
import { useRoomActions } from './hooks/useRoomActions';
import { sendReadReceiptsAtom, showRoomAvatarsAtom } from '@/app/store/atoms/settings';
import { buildSpaceMenu, markSpaceAsRead, buildHomeMenu, buildDmsMenu } from './spaceContextMenu';
import { RoomListItem, DmListItem } from './RoomListItem';
import { UserPanel } from './UserPanel';
import { isTextFieldTarget } from '@/app/features/keyboardShortcuts/keyEvents';
import * as css from './RoomListPanel.css';
import {
  getSpaceChildOrders,
  planSpaceReorder,
  saveFavouriteOrder,
  saveHomeOrder,
  saveSpaceChildOrders,
  sortFavourites,
  applyPendingOrder,
} from '@/app/features/room/roomOrder';
import { canSendState } from '@/app/hooks/useCanSendState';
import { getErrorMessage } from '@/util/error';
import { RoomReorderProvider, SortableRoomRow, type ReorderRow } from './RoomReorder';
import { EventType } from 'matrix-js-sdk';
import { useMatrixEvent } from '@/app/hooks/useMatrixEvent';
import { isVoiceRoom } from '@/util/matrix';
import type { CallMembership } from 'matrix-js-sdk/lib/matrixrtc';

const LIST_OVERSCAN = 5;

const noop = () => {};

const HOME_FAVOURITES_CATEGORY = 'home-favourites';
const HOME_ROOMS_CATEGORY = 'home-rooms';

type HomeListItem =
  | {
      kind: 'header';
      itemKey: string;
      label: string;
      hasNotif: boolean;
      hasMention: boolean;
      showAdd: boolean;
    }
  | { kind: 'room'; entry: RoomEntry; compact?: boolean };

type SpaceListItem =
  | { kind: 'header'; item: HierarchySpaceItem }
  | { kind: 'room'; item: HierarchyRoomItem; compact?: boolean };

interface RoomListPanelProps {
  onVoiceJoin: (roomId: string) => void;
}

interface SubspaceCategoryHeaderProps {
  item: HierarchySpaceItem;
  isClosed: boolean;
  onToggle: (categoryKey: string) => void;
  onAdd: (e: React.MouseEvent, item: HierarchySpaceItem) => void;
  client: ReturnType<typeof getMatrixClientOrNull>;
}

function SubspaceCategoryHeader({
  item,
  isClosed,
  onToggle,
  onAdd,
  client,
  showAvatar,
}: SubspaceCategoryHeaderProps & { showAvatar: boolean }) {
  const { t } = useTranslation();
  return (
    <div className={css.subspaceCategoryHeader} onClick={() => onToggle(item.categoryKey)}>
      <button
        type="button"
        className={css.subspaceToggle}
        onClick={(e) => {
          e.stopPropagation();
          onToggle(item.categoryKey);
        }}
        aria-expanded={!isClosed}
      >
        {showAvatar && !item.isRoot && (
          <Avatar name={item.name} mxcUrl={item.avatarMxc} client={client ?? undefined} size="xs" />
        )}
        <span className={css.subspaceName}>{item.isRoot ? 'Rooms' : item.name}</span>
        <CaretDownIcon
          size={10}
          weight="bold"
          className={[css.subspaceChevron, isClosed ? css.subspaceChevronClosed : '']
            .filter(Boolean)
            .join(' ')}
        />
        <span className={css.subspaceSpacer} />
        {item.hasNotif && (
          <span
            className={item.hasMention ? css.subspaceUnreadDotMention : css.subspaceUnreadDot}
          />
        )}
      </button>
      <Tooltip content={t('room.create.title')}>
        <button
          type="button"
          aria-label={t('room.create.title')}
          className={css.subspaceAddButton}
          onClick={(e) => {
            e.stopPropagation();
            onAdd(e, item);
          }}
        >
          <PlusIcon size={12} weight="bold" />
        </button>
      </Tooltip>
    </div>
  );
}

function HomeCategoryHeader({
  label,
  isClosed,
  onToggle,
  hasNotif,
  hasMention,
  showAdd,
  onAdd,
}: {
  label: string;
  isClosed: boolean;
  onToggle: () => void;
  hasNotif?: boolean;
  hasMention?: boolean;
  showAdd?: boolean;
  onAdd?: (e: React.MouseEvent) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className={css.subspaceCategoryHeader} onClick={onToggle}>
      <button
        type="button"
        className={css.subspaceToggle}
        onClick={(e) => {
          e.stopPropagation();
          onToggle();
        }}
        aria-expanded={!isClosed}
      >
        <span className={css.subspaceName}>{label}</span>
        <CaretDownIcon
          size={10}
          weight="bold"
          className={[css.subspaceChevron, isClosed ? css.subspaceChevronClosed : '']
            .filter(Boolean)
            .join(' ')}
        />
        <span className={css.subspaceSpacer} />
        {hasNotif && (
          <span className={hasMention ? css.subspaceUnreadDotMention : css.subspaceUnreadDot} />
        )}
      </button>
      {showAdd && onAdd && (
        <Tooltip content={t('room.create.title')}>
          <button
            type="button"
            aria-label={t('room.create.title')}
            className={css.subspaceAddButton}
            onClick={(e) => {
              e.stopPropagation();
              onAdd(e);
            }}
          >
            <PlusIcon size={12} weight="bold" />
          </button>
        </Tooltip>
      )}
    </div>
  );
}

export function RoomListPanel({ onVoiceJoin }: RoomListPanelProps) {
  const { t } = useTranslation();
  const { roomRow: roomItemHeight, categoryHeader: categoryHeaderHeight } = useUiDensitySizes();
  const [currentRoomId, setCurrentRoomId] = useAtom(currentRoomIdAtom);
  const [currentSpaceId] = useAtom(currentSpaceIdAtom);
  const [sidebarView] = useAtom(sidebarViewAtom);
  const [, setCreateRoomOpen] = useAtom(createRoomOpenAtom);
  const [, setNewDmOpen] = useAtom(newDmOpenAtom);
  const callUi = useAtomValue(callUiAtom);
  const callActions = useAtomValue(callActionsAtom);
  const [closedNavCategoriesArr, setClosedNavCategoriesArr] = useAtom(closedNavCategoriesAtom);
  const favouriteRooms = useAtomValue(favouriteRoomsAtom);
  const navigate = useNavigate();
  const client = getMatrixClientOrNull();
  const toast = useToast();
  const { openContextMenu } = useContextMenu();
  const roomActions = useRoomActions();
  const [pinnedSubSpacesArr, setPinnedSubSpacesArr] = useAtom(pinnedSubSpacesAtom);
  const pinnedSubSpaces = useMemo(() => new Set(pinnedSubSpacesArr), [pinnedSubSpacesArr]);
  const [, setSpaceSettings] = useAtom(spaceSettingsRoomIdAtom);
  const sendReadReceipts = useAtomValue(sendReadReceiptsAtom);
  const showRoomAvatars = useAtomValue(showRoomAvatarsAtom);
  const { spaces } = useSpaces();
  const setDrawerOpen = useSetAtom(mobileDrawerOpenAtom);

  const currentSpaceEntry = useMemo(
    () => spaces.find((s) => s.roomId === currentSpaceId) ?? null,
    [spaces, currentSpaceId]
  );

  const handleMarkSpaceAsRead = useCallback(
    (spaceId: string) => {
      markSpaceAsRead(client, sendReadReceipts, spaceId);
    },
    [client, sendReadReceipts]
  );

  const onCreateRoom = useCallback(() => {
    setCreateRoomOpen({ open: true, spaceId: null, spaceName: null });
  }, [setCreateRoomOpen]);

  const onNewDm = useCallback(() => {
    setNewDmOpen(true);
  }, [setNewDmOpen]);

  const buildSpaceMenuItems = useCallback(() => {
    if (!currentSpaceEntry) return [];
    return buildSpaceMenu(currentSpaceEntry, {
      t,
      navigate,
      roomActions,
      toast,
      pinnedSubSpaces,
      setPinnedSubSpacesArr,
      setSpaceSettings,
      markSpaceAsRead: handleMarkSpaceAsRead,
    });
  }, [
    currentSpaceEntry,
    t,
    navigate,
    roomActions,
    toast,
    pinnedSubSpaces,
    setPinnedSubSpacesArr,
    setSpaceSettings,
    handleMarkSpaceAsRead,
  ]);

  const buildHomeMenuItems = useCallback(
    () => buildHomeMenu({ t, client, sendReadReceipts, onCreateRoom }),
    [t, client, sendReadReceipts, onCreateRoom]
  );

  const buildDmsMenuItems = useCallback(
    () => buildDmsMenu({ t, client, sendReadReceipts, onNewDm }),
    [t, client, sendReadReceipts, onNewDm]
  );

  const spaceMenuTrigger = useContextMenuTrigger(buildSpaceMenuItems);
  const homeMenuTrigger = useContextMenuTrigger(buildHomeMenuItems);
  const dmMenuTrigger = useContextMenuTrigger(buildDmsMenuItems);

  const handleSpaceMenu = useCallback(
    (e: React.MouseEvent) => {
      if (!currentSpaceEntry) return;
      openContextMenu(e, buildSpaceMenuItems());
    },
    [currentSpaceEntry, openContextMenu, buildSpaceMenuItems]
  );

  const handleSubspaceAdd = useCallback(
    (_e: React.MouseEvent, item: HierarchySpaceItem) => {
      setCreateRoomOpen({ open: true, spaceId: item.roomId, spaceName: item.name });
    },
    [setCreateRoomOpen]
  );

  const handleHomeAdd = useCallback(
    (_e: React.MouseEvent) => {
      setCreateRoomOpen({ open: true, spaceId: null, spaceName: null });
    },
    [setCreateRoomOpen]
  );

  const handleHomeMenu = useCallback(
    (e: React.MouseEvent) => {
      openContextMenu(e, buildHomeMenuItems());
    },
    [openContextMenu, buildHomeMenuItems]
  );

  const handleDmsMenu = useCallback(
    (e: React.MouseEvent) => {
      openContextMenu(e, buildDmsMenuItems());
    },
    [openContextMenu, buildDmsMenuItems]
  );

  const isDmView = sidebarView === 'dms';
  const isSpaceView = sidebarView === 'space' && !!currentSpaceId;

  const closedCategories = useMemo(() => new Set(closedNavCategoriesArr), [closedNavCategoriesArr]);

  const toggleCategory = useCallback(
    (categoryKey: string) => {
      setClosedNavCategoriesArr((prev) => {
        const next = new Set(prev);
        if (next.has(categoryKey)) {
          next.delete(categoryKey);
        } else {
          next.add(categoryKey);
        }
        return Array.from(next);
      });
    },
    [setClosedNavCategoriesArr]
  );

  const { rooms: homeRooms, loading: homeLoading } = useRooms();
  const dms = useDms(client);

  const hierarchyItems = useSpaceHierarchy(isSpaceView ? currentSpaceId : null, favouriteRooms);

  const spaceFavKey = isSpaceView && currentSpaceId ? `${currentSpaceId}::favourites` : null;

  const [tagsRevision, setTagsRevision] = useState(0);
  useMatrixEvent(client, 'Room.tags', () => setTagsRevision((n) => n + 1));

  const callRoomId = callUi.roomId;
  const keepWhenClosed = useCallback(
    (roomId: string) => roomId === currentRoomId || roomId === callRoomId,
    [currentRoomId, callRoomId]
  );

  const spaceItemsBase = useMemo((): SpaceListItem[] => {
    void tagsRevision;
    if (!isSpaceView || !currentSpaceId || !client) return [];
    const favSet = favouriteRooms;

    const favRooms: HierarchyRoomItem[] = [];
    const rest: HierarchyItem[] = [];
    for (const item of hierarchyItems) {
      if (item.kind === 'room' && favSet.has(item.roomId)) favRooms.push(item);
      else rest.push(item);
    }

    const items: SpaceListItem[] = [];
    if (favRooms.length > 0 && spaceFavKey) {
      const favClosed = closedCategories.has(spaceFavKey);
      const favHasMention = favRooms.some((r) => r.entry.hasNotif);
      const favHasNotif = favHasMention || favRooms.some((r) => r.entry.unreadCount > 0);
      items.push({
        kind: 'header',
        item: {
          kind: 'space',
          roomId: spaceFavKey,
          categoryKey: spaceFavKey,
          name: t('room.favourites'),
          avatarMxc: null,
          hasNotif: favHasNotif,
          hasMention: favHasMention,
          isRoot: false,
          depth: 0,
        },
      });
      for (const room of sortFavourites(
        favRooms,
        (r) => client.getRoom(r.roomId),
        (r) => r.entry.name
      )) {
        if (favClosed && !keepWhenClosed(room.roomId)) continue;
        items.push({ kind: 'room', item: room, compact: favClosed });
      }
    }

    const hasRootSection = rest.some((i) => i.kind === 'space' && i.isRoot);
    if (!hasRootSection) {
      items.push({
        kind: 'header',
        item: {
          kind: 'space',
          roomId: currentSpaceId,
          categoryKey: `${currentSpaceId}::${currentSpaceId}`,
          name: '',
          avatarMxc: null,
          hasNotif: false,
          hasMention: false,
          isRoot: true,
          depth: 0,
        },
      });
    }

    const filterRoom = (h: HierarchyItem): boolean => {
      if (h.kind !== 'room') return true;
      return keepWhenClosed(h.roomId);
    };

    const collect = (list: HierarchyItem[]): SpaceListItem[] => {
      const out: SpaceListItem[] = [];
      const remaining = [...list];
      while (remaining.length > 0) {
        const head = remaining.shift()!;
        if (head.kind === 'room') {
          out.push({ kind: 'room', item: head });
          continue;
        }
        const depth = head.depth;
        const chunk: HierarchyItem[] = [];
        while (remaining.length > 0 && remaining[0].depth > depth) {
          chunk.push(remaining.shift()!);
        }
        const closed = closedCategories.has(head.categoryKey);
        const fullyOpen = !closed;
        if (fullyOpen || head.isRoot || chunk.length > 0) {
          out.push({ kind: 'header', item: head });
          if (fullyOpen) {
            out.push(...collect(chunk));
          } else {
            for (const sub of collect(chunk)) {
              const direct = sub.kind === 'room' && sub.item.depth === head.depth + 1;
              if (direct && !filterRoom(sub.item)) continue;
              out.push(direct ? { ...sub, compact: true } : sub);
            }
          }
        }
      }
      return out;
    };

    return items.concat(collect(rest));
  }, [
    isSpaceView,
    currentSpaceId,
    client,
    favouriteRooms,
    hierarchyItems,
    closedCategories,
    keepWhenClosed,
    spaceFavKey,
    t,
    tagsRevision,
  ]);

  const spaceVoiceRoomIds = useMemo(
    () =>
      spaceItemsBase
        .filter((i): i is Extract<SpaceListItem, { kind: 'room' }> => i.kind === 'room')
        .filter((i) => i.item.entry.hasVoiceRoom)
        .map((i) => i.item.roomId),
    [spaceItemsBase]
  );
  const homeVoiceRoomIds = useMemo(
    () => homeRooms.filter((r) => r.hasVoiceRoom).map((r) => r.roomId),
    [homeRooms]
  );
  const voiceRoomIds = isSpaceView ? spaceVoiceRoomIds : homeVoiceRoomIds;

  const membershipRoomIds = useMemo(() => {
    if (isDmView) return dms.map((d) => d.roomId);
    if (isSpaceView) {
      return spaceItemsBase
        .filter((i): i is Extract<SpaceListItem, { kind: 'room' }> => i.kind === 'room')
        .map((i) => i.item.roomId);
    }
    return homeRooms.map((r) => r.roomId);
  }, [isDmView, isSpaceView, spaceItemsBase, dms, homeRooms]);

  const serverMemberships = useCallMemberships(client, membershipRoomIds);

  const pendingCallRoomId = useAtomValue(pendingCallRoomIdAtom);
  const joiningRoomId = pendingCallRoomId ?? (callUi.phase !== 'idle' ? callUi.roomId : null);
  const myUserId = client?.getUserId() ?? null;
  const membershipsMap = useMemo(() => {
    if (!joiningRoomId || !myUserId || !voiceRoomIds.includes(joiningRoomId)) {
      return serverMemberships;
    }
    const members = serverMemberships.get(joiningRoomId) ?? [];
    if (members.some((m) => m.userId === myUserId && !m.isExpired())) return serverMemberships;
    const self = { userId: myUserId, isExpired: () => false } as unknown as CallMembership;
    return new Map(serverMemberships).set(joiningRoomId, [...members, self]);
  }, [serverMemberships, joiningRoomId, myUserId, voiceRoomIds]);

  const participantCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const roomId of voiceRoomIds) {
      const members = membershipsMap.get(roomId);
      if (!members) continue;
      const count = uniqueMembers(members).length;
      if (count > 0) map.set(roomId, count);
    }
    return map;
  }, [membershipsMap, voiceRoomIds]);

  const activeCallRoomIds = useMemo(() => {
    const active = new Set<string>();
    for (const [roomId, members] of membershipsMap) {
      if (uniqueMembers(members).length > 0) active.add(roomId);
    }
    return active;
  }, [membershipsMap]);

  const voiceMembersByRoom = useMemo(() => {
    const map = new Map<string, CallMembership[]>();
    for (const [roomId, members] of membershipsMap) {
      if (uniqueMembers(members).length > 0) map.set(roomId, members);
    }
    return map;
  }, [membershipsMap]);

  const getRoomEntryHeight = useCallback(
    (entry: RoomEntry, compact?: boolean) => {
      if (!entry.hasVoiceRoom) return roomItemHeight;
      const count = participantCounts.get(entry.roomId) ?? 0;
      return roomItemHeight + computeParticipantsBlockHeight(count, compact);
    },
    [participantCounts, roomItemHeight]
  );

  const homeItemsBase = useMemo((): HomeListItem[] => {
    void tagsRevision;
    if (isSpaceView || isDmView || !client) return [];
    const favSet = favouriteRooms;

    const favEntries: RoomEntry[] = [];
    for (const entry of homeRooms) {
      if (favSet.has(entry.roomId)) {
        favEntries.push(entry);
      }
    }

    const otherEntries = homeRooms.filter((entry) => !favSet.has(entry.roomId));

    const items: HomeListItem[] = [];
    const pushSection = (itemKey: string, entries: RoomEntry[]) => {
      const hasMention = entries.some((entry) => entry.hasNotif);
      const hasNotif = hasMention || entries.some((entry) => entry.unreadCount > 0);
      items.push({
        kind: 'header',
        itemKey,
        label: itemKey === HOME_FAVOURITES_CATEGORY ? t('room.favourites') : t('room.title'),
        hasNotif,
        hasMention,
        showAdd: itemKey === HOME_ROOMS_CATEGORY,
      });
      const closed = closedCategories.has(itemKey);
      for (const entry of entries) {
        if (closed && !keepWhenClosed(entry.roomId)) continue;
        items.push({ kind: 'room', entry, compact: closed });
      }
    };

    if (favEntries.length > 0) {
      pushSection(
        HOME_FAVOURITES_CATEGORY,
        sortFavourites(
          favEntries,
          (e) => client.getRoom(e.roomId),
          (e) => e.name
        )
      );
    }
    pushSection(HOME_ROOMS_CATEGORY, otherEntries);
    return items;
  }, [
    isSpaceView,
    isDmView,
    client,
    favouriteRooms,
    homeRooms,
    closedCategories,
    keepWhenClosed,
    t,
    tagsRevision,
  ]);

  const spaceReorderRows = useCallback(
    (items: SpaceListItem[]): ReorderRow[] => {
      const rows: ReorderRow[] = [];
      let headerKey: string | null = null;
      for (const it of items) {
        if (it.kind === 'header') {
          headerKey = it.item.categoryKey;
          continue;
        }
        const isFavourite = headerKey !== null && headerKey === spaceFavKey;
        const closed = headerKey !== null && closedCategories.has(headerKey);
        const allowed =
          !closed &&
          (isFavourite ||
            canSendState(client?.getRoom(it.item.parentSpaceId) ?? null, EventType.SpaceChild));
        rows.push({
          roomId: it.item.roomId,
          section: allowed ? (isFavourite ? 'fav' : `space:${it.item.parentSpaceId}`) : null,
        });
      }
      return rows;
    },
    [client, spaceFavKey, closedCategories]
  );

  const homeReorderRows = useCallback(
    (items: HomeListItem[]): ReorderRow[] => {
      const rows: ReorderRow[] = [];
      let headerKey: string | null = null;
      for (const it of items) {
        if (it.kind === 'header') {
          headerKey = it.itemKey;
          continue;
        }
        const closed = headerKey !== null && closedCategories.has(headerKey);
        rows.push({
          roomId: it.entry.roomId,
          section: closed ? null : headerKey === HOME_FAVOURITES_CATEGORY ? 'fav' : 'home',
        });
      }
      return rows;
    },
    [closedCategories]
  );

  const [pendingOrder, setPendingOrder] = useState<{ section: string; ids: string[] } | null>(null);
  const pendingSectionIds = useCallback(
    (rows: ReorderRow[]) =>
      new Set(
        rows.filter((r) => pendingOrder && r.section === pendingOrder.section).map((r) => r.roomId)
      ),
    [pendingOrder]
  );
  const spaceItems = useMemo(
    () =>
      applyPendingOrder(
        spaceItemsBase,
        pendingSectionIds(spaceReorderRows(spaceItemsBase)),
        pendingOrder?.ids ?? null,
        (it) => (it.kind === 'room' ? it.item.roomId : null)
      ),
    [spaceItemsBase, spaceReorderRows, pendingOrder, pendingSectionIds]
  );
  const homeItems = useMemo(
    () =>
      applyPendingOrder(
        homeItemsBase,
        pendingSectionIds(homeReorderRows(homeItemsBase)),
        pendingOrder?.ids ?? null,
        (it) => (it.kind === 'room' ? it.entry.roomId : null)
      ),
    [homeItemsBase, homeReorderRows, pendingOrder, pendingSectionIds]
  );
  const reorderRows = useMemo(
    () =>
      isSpaceView ? spaceReorderRows(spaceItems) : !isDmView ? homeReorderRows(homeItems) : [],
    [isSpaceView, isDmView, spaceItems, homeItems, spaceReorderRows, homeReorderRows]
  );
  const reorderDisabled = useMemo(
    () => new Set(reorderRows.filter((r) => r.section === null).map((r) => r.roomId)),
    [reorderRows]
  );

  useEffect(() => {
    if (!pendingOrder) return;
    const base = isSpaceView ? spaceReorderRows(spaceItemsBase) : homeReorderRows(homeItemsBase);
    const synced = base.filter((r) => r.section === pendingOrder.section).map((r) => r.roomId);
    if (synced.join('|') === pendingOrder.ids.join('|')) {
      setPendingOrder(null);
      return;
    }
    const timer = setTimeout(() => setPendingOrder(null), 8000);
    return () => clearTimeout(timer);
  }, [pendingOrder, isSpaceView, spaceItemsBase, homeItemsBase, spaceReorderRows, homeReorderRows]);

  const handleReorder = useCallback(
    (section: string, orderedIds: string[], movedId: string) => {
      if (!client) return;
      setPendingOrder({ section, ids: orderedIds });
      let save: Promise<void>;
      if (section === 'fav') {
        save = saveFavouriteOrder(client, orderedIds);
      } else if (section === 'home') {
        save = saveHomeOrder(client, orderedIds);
      } else {
        const spaceId = section.slice('space:'.length);
        const space = client.getRoom(spaceId);
        if (!space) return;
        const updates = planSpaceReorder(orderedIds, getSpaceChildOrders(space), movedId);
        save = saveSpaceChildOrders(client, spaceId, updates);
      }
      save.catch((err: unknown) => {
        setPendingOrder(null);
        toast.error(t('room.reorderFailed', { error: getErrorMessage(err) }));
      });
    },
    [client, toast, t]
  );

  const renderReorderOverlay = (roomId: string) => {
    const entry = isSpaceView
      ? spaceItems.find(
          (it): it is Extract<SpaceListItem, { kind: 'room' }> =>
            it.kind === 'room' && it.item.roomId === roomId
        )?.item.entry
      : homeItems.find(
          (it): it is Extract<HomeListItem, { kind: 'room' }> =>
            it.kind === 'room' && it.entry.roomId === roomId
        )?.entry;
    if (!entry) return null;
    return (
      <RoomListItem
        entry={entry}
        isActive={currentRoomId === roomId}
        hasActiveCall={activeCallRoomIds.has(roomId) && !entry.hasVoiceRoom}
        isInCall={callUi.roomId === roomId}
        voiceMembers={voiceMembersByRoom.get(roomId)}
        onSelect={noop}
        onOpenChat={noop}
        onOpenChatOnly={noop}
      />
    );
  };

  const roomListRef = useRef<HTMLDivElement>(null);
  const bottomDockRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const el = bottomDockRef.current;
    if (!el) return;
    const root = document.documentElement;
    const update = () => {
      const rect = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      const margin = parseFloat(style.marginTop) + parseFloat(style.marginBottom);
      root.style.setProperty('--bottom-dock-inset', `${Math.ceil(rect.height + margin + 8)}px`);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => {
      ro.disconnect();
      root.style.removeProperty('--bottom-dock-inset');
    };
  }, []);

  const spaceVirtualizer = useVirtualizer({
    count: spaceItems.length,
    getScrollElement: () => roomListRef.current,
    estimateSize: (index) => {
      const item = spaceItems[index];
      if (item.kind === 'header') return categoryHeaderHeight;
      return getRoomEntryHeight(item.item.entry, item.compact);
    },
    getItemKey: (index) => {
      const item = spaceItems[index];
      return item.kind === 'header'
        ? `header-${item.item.categoryKey}`
        : `room-${item.item.roomId}`;
    },
    overscan: LIST_OVERSCAN,
    enabled: isSpaceView,
  });

  const homeVirtualizer = useVirtualizer({
    count: homeItems.length,
    getScrollElement: () => roomListRef.current,
    estimateSize: (index) => {
      const item = homeItems[index];
      return item.kind === 'header'
        ? categoryHeaderHeight
        : getRoomEntryHeight(item.entry, item.compact);
    },
    getItemKey: (index) => {
      const item = homeItems[index];
      return item.kind === 'header' ? `header-${item.itemKey}` : item.entry.roomId;
    },
    overscan: LIST_OVERSCAN,
    enabled: !isDmView && !isSpaceView,
  });

  const dmVirtualizer = useVirtualizer({
    count: dms.length,
    getScrollElement: () => roomListRef.current,
    estimateSize: () => roomItemHeight,
    overscan: LIST_OVERSCAN,
    enabled: isDmView,
  });

  useEffect(() => {
    spaceVirtualizer.measure();
    homeVirtualizer.measure();
    dmVirtualizer.measure();
  }, [roomItemHeight, categoryHeaderHeight, spaceVirtualizer, homeVirtualizer, dmVirtualizer]);

  useEffect(() => {
    if (isSpaceView) spaceVirtualizer.measure();
  }, [participantCounts, spaceItems, spaceVirtualizer, isSpaceView]);

  useEffect(() => {
    if (isSpaceView && roomListRef.current) {
      roomListRef.current.scrollTop = 0;
    }
  }, [currentSpaceId, isSpaceView]);

  useEffect(() => {
    if (!isSpaceView && !isDmView) homeVirtualizer.measure();
  }, [participantCounts, homeItems, homeVirtualizer, isSpaceView, isDmView]);

  const selectRoom = useCallback(
    (roomId: string, isDm = false) => {
      const room = client?.getRoom(roomId);
      const navigateToRoom = () => {
        setCurrentRoomId(roomId);
        setDrawerOpen(false);
        navigate(`/${isDm ? 'dm' : 'r'}/${encodeURIComponent(roomId)}`, {
          state: { sidebarView, currentSpaceId },
        });
      };
      const isVoice = !isDm && !!room && isVoiceRoom(room);
      if (isVoice) {
        if (callUi.roomId === roomId) {
          navigateToRoom();
          callActions?.setPresentation('room');
          return;
        }
        onVoiceJoin(roomId);
        return;
      }
      navigateToRoom();
    },
    [
      setCurrentRoomId,
      navigate,
      sidebarView,
      currentSpaceId,
      client,
      callUi.roomId,
      callActions,
      onVoiceJoin,
      setDrawerOpen,
    ]
  );

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.defaultPrevented || !e.altKey || e.metaKey || e.ctrlKey || e.shiftKey) return;
      if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
      if (isTextFieldTarget(e)) return;
      let ids: string[];
      let virtualizer: { scrollToIndex: (index: number, opts?: { align?: 'auto' }) => void };
      if (isDmView) {
        ids = dms.map((d) => d.roomId);
        virtualizer = dmVirtualizer;
      } else if (isSpaceView) {
        ids = spaceItems.map((it) => (it.kind === 'room' ? it.item.roomId : ''));
        virtualizer = spaceVirtualizer;
      } else {
        ids = homeItems.map((it) => (it.kind === 'room' ? it.entry.roomId : ''));
        virtualizer = homeVirtualizer;
      }
      const roomIndexes = ids.flatMap((id, index) => (id ? [index] : []));
      if (roomIndexes.length === 0) return;
      e.preventDefault();
      const down = e.key === 'ArrowDown';
      const current = roomIndexes.findIndex((index) => ids[index] === currentRoomId);
      const nextPos =
        current === -1
          ? down
            ? 0
            : roomIndexes.length - 1
          : (current + (down ? 1 : -1) + roomIndexes.length) % roomIndexes.length;
      const index = roomIndexes[nextPos];
      const roomId = ids[index];
      setCurrentRoomId(roomId);
      navigate(`/${isDmView ? 'dm' : 'r'}/${encodeURIComponent(roomId)}`, {
        state: { sidebarView, currentSpaceId },
      });
      virtualizer.scrollToIndex(index, { align: 'auto' });
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [
    isDmView,
    isSpaceView,
    dms,
    spaceItems,
    homeItems,
    dmVirtualizer,
    spaceVirtualizer,
    homeVirtualizer,
    currentRoomId,
    setCurrentRoomId,
    navigate,
    sidebarView,
    currentSpaceId,
  ]);

  const openRoomChat = useSetAtom(openRoomChatAtom);

  const openChatOnly = useCallback(
    (roomId: string) => {
      setCurrentRoomId(roomId);
      setDrawerOpen(false);
      navigate(`/r/${encodeURIComponent(roomId)}`, {
        state: { sidebarView, currentSpaceId },
      });
      openRoomChat(roomId);
    },
    [setCurrentRoomId, navigate, sidebarView, currentSpaceId, setDrawerOpen, openRoomChat]
  );

  const openVoiceChat = useCallback(
    (roomId: string) => {
      setCurrentRoomId(roomId);
      setDrawerOpen(false);
      navigate(`/r/${encodeURIComponent(roomId)}`, {
        state: { sidebarView, currentSpaceId },
      });
      if (client && callUi.roomId !== roomId) {
        const room = client.getRoom(roomId);
        if (room && room.getMyMembership() === 'join' && isVoiceRoom(room)) onVoiceJoin(roomId);
      }
    },
    [
      setCurrentRoomId,
      navigate,
      sidebarView,
      currentSpaceId,
      client,
      callUi.roomId,
      onVoiceJoin,
      setDrawerOpen,
    ]
  );

  const isSpaceContext = sidebarView === 'space' && !!currentSpaceId;
  const headerLabel = isDmView
    ? t('room.dm.directMessages')
    : isSpaceContext
      ? (client?.getRoom(currentSpaceId!)?.name ?? t('room.home'))
      : t('room.home');

  const renderSpaceList = () => {
    return (
      <div ref={roomListRef} className={css.roomList}>
        <RoomReorderProvider
          rows={reorderRows}
          onReorder={handleReorder}
          renderOverlay={renderReorderOverlay}
        >
          <div style={{ height: spaceVirtualizer.getTotalSize(), position: 'relative' }}>
            {spaceVirtualizer.getVirtualItems().map((virtualRow) => {
              const item = spaceItems[virtualRow.index];
              return (
                <div
                  key={virtualRow.key}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    boxSizing: 'border-box',
                    height: `${virtualRow.size}px`,
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                >
                  {item.kind === 'header' ? (
                    spaceFavKey && item.item.categoryKey === spaceFavKey ? (
                      <HomeCategoryHeader
                        label={item.item.name}
                        isClosed={closedCategories.has(spaceFavKey)}
                        onToggle={() => toggleCategory(spaceFavKey)}
                        hasNotif={item.item.hasNotif}
                        hasMention={item.item.hasMention}
                      />
                    ) : (
                      <SubspaceCategoryHeader
                        item={item.item}
                        isClosed={closedCategories.has(item.item.categoryKey)}
                        onToggle={toggleCategory}
                        onAdd={handleSubspaceAdd}
                        client={client}
                        showAvatar={showRoomAvatars}
                      />
                    )
                  ) : (
                    <SortableRoomRow
                      roomId={item.item.roomId}
                      disabled={reorderDisabled.has(item.item.roomId)}
                    >
                      <RoomListItem
                        entry={item.item.entry}
                        isActive={currentRoomId === item.item.roomId}
                        hasActiveCall={
                          activeCallRoomIds.has(item.item.roomId) && !item.item.entry.hasVoiceRoom
                        }
                        isInCall={callUi.roomId === item.item.roomId}
                        voiceMembers={voiceMembersByRoom.get(item.item.roomId)}
                        compactVoice={item.compact}
                        onSelect={selectRoom}
                        onOpenChat={openVoiceChat}
                        onOpenChatOnly={openChatOnly}
                      />
                    </SortableRoomRow>
                  )}
                </div>
              );
            })}
          </div>
        </RoomReorderProvider>
      </div>
    );
  };

  const renderHomeList = () => {
    if (homeLoading && homeRooms.length === 0) {
      return (
        <div ref={roomListRef} className={css.roomList}>
          <div className={css.skeletonList}>
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className={css.skeletonRow}>
                <div className={css.skeletonAvatar} />
                <div className={css.skeletonLines}>
                  <div className={css.skeletonLine} />
                  <div className={css.skeletonLineShort} />
                </div>
              </div>
            ))}
          </div>
        </div>
      );
    }
    return (
      <div ref={roomListRef} className={css.roomList}>
        <RoomReorderProvider
          rows={reorderRows}
          onReorder={handleReorder}
          renderOverlay={renderReorderOverlay}
        >
          <div style={{ height: homeVirtualizer.getTotalSize(), position: 'relative' }}>
            {homeVirtualizer.getVirtualItems().map((virtualRow) => {
              const item = homeItems[virtualRow.index];
              return (
                <div
                  key={virtualRow.key}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: `${virtualRow.size}px`,
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                >
                  {item.kind === 'header' ? (
                    <HomeCategoryHeader
                      label={item.label}
                      isClosed={closedCategories.has(item.itemKey)}
                      onToggle={() => toggleCategory(item.itemKey)}
                      hasNotif={item.hasNotif}
                      hasMention={item.hasMention}
                      showAdd={item.showAdd}
                      onAdd={handleHomeAdd}
                    />
                  ) : (
                    <SortableRoomRow
                      roomId={item.entry.roomId}
                      disabled={reorderDisabled.has(item.entry.roomId)}
                    >
                      <RoomListItem
                        entry={item.entry}
                        isActive={currentRoomId === item.entry.roomId}
                        hasActiveCall={
                          activeCallRoomIds.has(item.entry.roomId) && !item.entry.hasVoiceRoom
                        }
                        isInCall={callUi.roomId === item.entry.roomId}
                        voiceMembers={voiceMembersByRoom.get(item.entry.roomId)}
                        compactVoice={item.compact}
                        onSelect={selectRoom}
                        onOpenChat={openVoiceChat}
                        onOpenChatOnly={openChatOnly}
                      />
                    </SortableRoomRow>
                  )}
                </div>
              );
            })}
          </div>
        </RoomReorderProvider>
      </div>
    );
  };

  const renderDmList = () => {
    if (dms.length === 0) {
      return (
        <div ref={roomListRef} className={css.roomList}>
          <div className={css.emptyList}>{t('room.noDms')}</div>
        </div>
      );
    }
    return (
      <div ref={roomListRef} className={css.roomList}>
        <div style={{ height: dmVirtualizer.getTotalSize(), position: 'relative' }}>
          {dmVirtualizer.getVirtualItems().map((virtualRow) => {
            const entry = dms[virtualRow.index];
            return (
              <div
                key={entry.roomId}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: `${virtualRow.size}px`,
                  transform: `translateY(${virtualRow.start}px)`,
                }}
              >
                <DmListItem
                  entry={entry}
                  isActive={currentRoomId === entry.roomId}
                  hasActiveCall={activeCallRoomIds.has(entry.roomId)}
                  isInCall={callUi.roomId === entry.roomId}
                  onSelect={selectRoom}
                />
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className={css.roomListPanel}>
      <header className={css.roomHeader}>
        <Tooltip content={headerLabel}>
          <h2 className={css.roomHeaderTitle}>
            <span className={css.roomHeaderLabel}>{headerLabel}</span>
          </h2>
        </Tooltip>
        <div className={css.roomHeaderActions}>
          {sidebarView === 'space' && currentSpaceEntry ? (
            <IconButton
              size="sm"
              tooltip={t('common.menu')}
              aria-label={t('common.menu')}
              onClick={handleSpaceMenu}
              {...spaceMenuTrigger}
            >
              <DotsThreeVerticalIcon size={16} weight="bold" />
            </IconButton>
          ) : isDmView ? (
            <IconButton
              size="sm"
              tooltip={t('common.markRead')}
              aria-label={t('common.markRead')}
              onClick={handleDmsMenu}
              {...dmMenuTrigger}
            >
              <DotsThreeVerticalIcon size={16} weight="bold" />
            </IconButton>
          ) : (
            <IconButton
              size="sm"
              tooltip={t('common.markRead')}
              aria-label={t('common.markRead')}
              onClick={handleHomeMenu}
              {...homeMenuTrigger}
            >
              <DotsThreeVerticalIcon size={16} weight="bold" />
            </IconButton>
          )}
        </div>
      </header>

      {isDmView ? renderDmList() : isSpaceView ? renderSpaceList() : renderHomeList()}

      <div ref={bottomDockRef} className={css.bottomDock}>
        <CallBar />
        <UserPanel />
      </div>
    </div>
  );
}
