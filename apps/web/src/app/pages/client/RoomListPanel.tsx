import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDownIcon,
  ArrowUpIcon,
  CaretDownIcon,
  DotsThreeVerticalIcon,
  HouseIcon,
  PencilSimpleIcon,
  PlusIcon,
  TrashIcon,
} from '@phosphor-icons/react';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import { useNavigate } from 'react-router-dom';
import { useQueries } from '@tanstack/react-query';
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
  lowPriorityRoomsAtom,
  openRoomChatAtom,
  createCategoryOpenAtom,
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
import { VoiceJoinSheet } from '@/app/features/calls/VoiceJoinSheet';
import {
  callActionsAtom,
  callUiAtom,
  leavingCallRoomIdAtom,
  pendingCallRoomIdAtom,
} from '@/app/store/atoms/call';
import { computeParticipantsBlockHeight } from '@/app/features/voice/participantSize';
import { useTouchUi, useUiDensitySizes } from '@/app/hooks/useUiDensitySync';
import { Avatar } from '@/app/components/Avatar';
import { getMatrixClientOrNull } from '@/client/initMatrix';
import { useRoomActions } from './hooks/useRoomActions';
import { sendReadReceiptsAtom, showRoomAvatarsAtom } from '@/app/store/atoms/settings';
import { buildSpaceMenu, markSpaceAsRead, buildHomeMenu, buildDmsMenu } from './spaceContextMenu';
import { RoomListItem, DmListItem } from './RoomListItem';
import { UserPanel } from './UserPanel';
import { isTextFieldTarget } from '@/app/features/keyboardShortcuts/keyEvents';
import { useMediaQuery } from '@/app/hooks/useMediaQuery';
import * as css from './RoomListPanel.css';
import {
  planSpaceReorder,
  saveFavouriteOrder,
  saveHomeOrder,
  saveSpaceChildOrders,
  sortFavourites,
  applyPendingOrder,
  useFavouriteOrders,
} from '@/app/features/room/roomOrder';
import { isValidSpaceOrder } from '@/app/features/room/roomOrder';
import {
  canSendState,
  childrenOf,
  queryKeys,
  roomsByIdAtom,
  useAllRooms,
  useRoomDetails,
  useRoomSections,
  useRoomTagNames,
  useSpaceGraph,
} from '@/app/data';
import { getErrorMessage } from '@/util/error';
import {
  RoomReorderProvider,
  SortableHeaderRow,
  SortableRoomRow,
  type ReorderRow,
} from './RoomReorder';
import * as reorderCss from './RoomReorder.css';
import {
  HOME_SPACE,
  getRoomSectionTag,
  ROOMS_ANCHOR,
  type RoomSection,
} from '@/app/features/room/roomSections';
import { usePrompt } from '@/app/hooks/usePrompt';
import { useSpaceNicknamePrompt } from '@/app/hooks/useSpaceNicknames';
import { useConfirm } from '@/app/hooks/useConfirm';
import { isVoiceRoom } from '@/util/matrix';
import { manageableAncestors, moveVoiceUser } from '@/app/features/voice/voiceMove';
import { activeRoomListStyleAtom, useSpaceListStyle } from '@/app/features/space/spaceListStyle';
import { useSpaceBanner } from '@/app/features/space/spaceBanner';
import { SpaceBannerView } from '@/app/features/space/SpaceBannerView';
import * as bannerCss from '@/app/features/space/SpaceBanner.css';
import { moveRoomToCategory, saveSpaceChildrenOrder } from '@/app/features/space/spaceOrder';
import { useRoomsWhereCanSendState } from '@/app/features/space/useStatePermissions';
import { useFlaggedVoiceChannels } from '@/app/features/room/voiceChannel';
import { arrangeModernItems, categoryParentsOf } from './modernRoomList';

const LIST_OVERSCAN = 5;

const noop = () => {};

const HOME_FAVOURITES_CATEGORY = 'home-favourites';
const HOME_ROOMS_CATEGORY = 'home-rooms';
const HOME_LOW_PRIORITY_CATEGORY = 'home-lowpriority';

type HomeListItem =
  | {
      kind: 'header';
      itemKey: string;
      label: string;
      hasNotif: boolean;
      hasMention: boolean;
      showAdd: boolean;
    }
  | SectionListItem
  | { kind: 'room'; entry: RoomEntry; compact?: boolean };

type SpaceListItem =
  | { kind: 'header'; item: HierarchySpaceItem }
  | SectionListItem
  | { kind: 'room'; item: HierarchyRoomItem; compact?: boolean };

type SectionListItem = {
  kind: 'section';
  key: string;
  section: RoomSection;
  hasNotif: boolean;
  hasMention: boolean;
};

const SECTION_ROWS = 'section';

interface RoomListPanelProps {
  onVoiceJoin: (roomId: string) => void;
}

interface SubspaceCategoryHeaderProps {
  item: HierarchySpaceItem;
  isClosed: boolean;
  onToggle: (categoryKey: string) => void;
  onAdd: (e: React.MouseEvent, item: HierarchySpaceItem) => void;
  onMenu?: (e: React.MouseEvent) => void;
  client: ReturnType<typeof getMatrixClientOrNull>;
}

function SubspaceCategoryHeader({
  item,
  isClosed,
  onToggle,
  onAdd,
  onMenu,
  client,
  showAvatar,
}: SubspaceCategoryHeaderProps & { showAvatar: boolean }) {
  const { t } = useTranslation();
  return (
    <div
      className={css.subspaceCategoryHeader}
      onClick={() => onToggle(item.categoryKey)}
      onContextMenu={onMenu}
    >
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
      {onMenu && (
        <Tooltip content={t('room.sections.options')}>
          <button
            type="button"
            aria-label={t('room.sections.options')}
            className={css.subspaceAddButton}
            onClick={(e) => {
              e.stopPropagation();
              onMenu(e);
            }}
          >
            <DotsThreeVerticalIcon size={14} weight="bold" />
          </button>
        </Tooltip>
      )}
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
  onMenu,
}: {
  label: string;
  isClosed: boolean;
  onToggle: () => void;
  hasNotif?: boolean;
  hasMention?: boolean;
  showAdd?: boolean;
  onAdd?: (e: React.MouseEvent) => void;
  onMenu?: (e: React.MouseEvent) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className={css.subspaceCategoryHeader} onClick={onToggle} onContextMenu={onMenu}>
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
      {onMenu && (
        <Tooltip content={t('room.sections.options')}>
          <button
            type="button"
            aria-label={t('room.sections.options')}
            className={css.subspaceAddButton}
            onClick={(e) => {
              e.stopPropagation();
              onMenu(e);
            }}
          >
            <DotsThreeVerticalIcon size={14} weight="bold" />
          </button>
        </Tooltip>
      )}
    </div>
  );
}

export function RoomListPanel({ onVoiceJoin }: RoomListPanelProps) {
  const { t } = useTranslation();
  const { roomRow: roomItemHeight, categoryHeader: categoryHeaderHeight } = useUiDensitySizes();
  const touchUi = useTouchUi();
  const [currentRoomId, setCurrentRoomId] = useAtom(currentRoomIdAtom);
  const [currentSpaceId] = useAtom(currentSpaceIdAtom);
  const [sidebarView] = useAtom(sidebarViewAtom);
  const [, setCreateRoomOpen] = useAtom(createRoomOpenAtom);
  const [, setNewDmOpen] = useAtom(newDmOpenAtom);
  const callUi = useAtomValue(callUiAtom);
  const callActions = useAtomValue(callActionsAtom);
  const [closedNavCategoriesArr, setClosedNavCategoriesArr] = useAtom(closedNavCategoriesAtom);
  const favouriteRooms = useAtomValue(favouriteRoomsAtom);
  const lowPriorityRooms = useAtomValue(lowPriorityRoomsAtom);
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
  const isMobile = useMediaQuery('(max-width: 768px)');
  // Phones: a tap on a voice room shows who is in it, and a second tap joins
  const [voicePreviewId, setVoicePreviewId] = useState<string | null>(null);

  const handleNewSectionRef = useRef<() => Promise<void>>(async () => {});
  const currentSpaceEntry = useMemo(
    () => spaces.find((s) => s.roomId === currentSpaceId) ?? null,
    [spaces, currentSpaceId]
  );

  const allRooms = useAllRooms();
  const spaceGraph = useSpaceGraph();
  const roomsById = useAtomValue(roomsByIdAtom);

  const isDmView = sidebarView === 'dms';
  const isSpaceView = sidebarView === 'space' && !!currentSpaceId;
  // Modern: the space's own list style (Mudrix), shared by everyone in it
  const modernList = useSpaceListStyle(isSpaceView ? currentSpaceId : null) === 'modern';
  const setActiveListStyle = useSetAtom(activeRoomListStyleAtom);
  useEffect(() => {
    setActiveListStyle(modernList ? 'modern' : 'matrix');
  }, [modernList, setActiveListStyle]);
  const spaceBanner = useSpaceBanner(isSpaceView ? currentSpaceId : null);
  const setCreateCategoryOpen = useSetAtom(createCategoryOpenAtom);
  const ownSpaceIds = useMemo(
    () => (isSpaceView && currentSpaceId ? [currentSpaceId] : []),
    [isSpaceView, currentSpaceId]
  );
  const canOrderCurrentSpace = useRoomsWhereCanSendState(ownSpaceIds, 'm.space.child').size > 0;

  const setNickname = useSpaceNicknamePrompt(client);
  const handleMarkSpaceAsRead = useCallback(
    (spaceId: string) => {
      markSpaceAsRead(client, sendReadReceipts, spaceId, allRooms, spaceGraph);
    },
    [client, sendReadReceipts, allRooms, spaceGraph]
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
      rooms: allRooms,
      graph: spaceGraph,
      roomActions,
      toast,
      pinnedSubSpaces,
      setPinnedSubSpacesArr,
      setSpaceSettings,
      markSpaceAsRead: handleMarkSpaceAsRead,
      setNickname,
      onCreateSection: () => void handleNewSectionRef.current(),
      onCreateCategory:
        modernList && canOrderCurrentSpace && currentSpaceId
          ? () => setCreateCategoryOpen({ open: true, parentSpaceId: currentSpaceId })
          : undefined,
    });
  }, [
    setNickname,
    modernList,
    canOrderCurrentSpace,
    currentSpaceId,
    setCreateCategoryOpen,
    currentSpaceEntry,
    t,
    navigate,
    allRooms,
    spaceGraph,
    roomActions,
    toast,
    pinnedSubSpaces,
    setPinnedSubSpacesArr,
    setSpaceSettings,
    handleMarkSpaceAsRead,
  ]);

  const buildHomeMenuItems = useCallback(
    () =>
      buildHomeMenu({
        t,
        client,
        rooms: allRooms,
        graph: spaceGraph,
        sendReadReceipts,
        onCreateRoom,
        onCreateSection: () => void handleNewSectionRef.current(),
      }),
    [t, client, allRooms, spaceGraph, sendReadReceipts, onCreateRoom]
  );

  const buildDmsMenuItems = useCallback(
    () =>
      buildDmsMenu({
        t,
        client,
        rooms: allRooms,
        graph: spaceGraph,
        sendReadReceipts,
        onNewDm,
      }),
    [t, client, allRooms, spaceGraph, sendReadReceipts, onNewDm]
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
  const dms = useDms();

  // Modern keeps categories that are still empty, so channels can be put in them
  const rawHierarchyItems = useSpaceHierarchy(
    isSpaceView ? currentSpaceId : null,
    favouriteRooms,
    modernList
  );
  const hierarchyRoomIds = useMemo(
    () =>
      modernList ? rawHierarchyItems.flatMap((i) => (i.kind === 'room' ? [i.roomId] : [])) : [],
    [modernList, rawHierarchyItems]
  );
  const flaggedVoice = useFlaggedVoiceChannels(hierarchyRoomIds);
  const hierarchyItems = useMemo(
    () => (modernList ? arrangeModernItems(rawHierarchyItems, flaggedVoice) : rawHierarchyItems),
    [modernList, rawHierarchyItems, flaggedVoice]
  );
  const categoryParents = useMemo(
    () => (modernList ? categoryParentsOf(hierarchyItems) : new Map<string, string>()),
    [modernList, hierarchyItems]
  );

  const spaceFavKey = isSpaceView && currentSpaceId ? `${currentSpaceId}::favourites` : null;
  const spaceLowKey = isSpaceView && currentSpaceId ? `${currentSpaceId}::lowpriority` : null;
  const favouriteOrdersVersion = useFavouriteOrders();
  const roomTagNames = useRoomTagNames();
  const sections = useRoomSections();
  const [draggingSection, setDraggingSection] = useState(false);
  const roomsHeaderId =
    isSpaceView && currentSpaceId
      ? `hdr:${currentSpaceId}::${currentSpaceId}`
      : `hdr:${HOME_ROOMS_CATEGORY}`;
  const [dropGroup, setDropGroup] = useState<string | null>(null);
  const isCollapsed = useCallback(
    (key: string) => draggingSection || closedCategories.has(key),
    [draggingSection, closedCategories]
  );
  const prompt = usePrompt();
  const confirmDialog = useConfirm();
  const sectionContext = isSpaceView && currentSpaceId ? currentSpaceId : HOME_SPACE;

  const sectionError = useCallback(
    (err: unknown) => toast.error(t('room.sections.failed', { error: getErrorMessage(err) })),
    [toast, t]
  );

  const handleNewSection = useCallback(async () => {
    if (!client) return;
    const name = (await prompt({ title: t('room.sections.newTitle') }))?.trim();
    if (name) client.createRoomSection(name, sectionContext).catch(sectionError);
  }, [client, prompt, t, sectionContext, sectionError]);
  handleNewSectionRef.current = handleNewSection;

  const visibleAnchorsRef = useRef<string[]>([]);
  const moveItems = useCallback(
    (anchor: string) => {
      const anchors = visibleAnchorsRef.current;
      const index = anchors.indexOf(anchor);
      const move = (direction: -1 | 1) => {
        if (!client) return;
        const next = [...anchors];
        [next[index], next[index + direction]] = [next[index + direction], next[index]];
        client.setRoomSectionOrder(next).catch(sectionError);
      };
      return [
        {
          label: t('room.sections.moveUp'),
          icon: <ArrowUpIcon size={14} />,
          disabled: index <= 0,
          onClick: () => move(-1),
        },
        {
          label: t('room.sections.moveDown'),
          icon: <ArrowDownIcon size={14} />,
          disabled: index === -1 || index >= anchors.length - 1,
          onClick: () => move(1),
        },
      ];
    },
    [client, t, sectionError]
  );

  const openRoomsMenu = useCallback(
    (e: React.MouseEvent) => openContextMenu(e, moveItems(ROOMS_ANCHOR)),
    [openContextMenu, moveItems]
  );

  const openSectionMenu = useCallback(
    (e: React.MouseEvent, section: RoomSection) => {
      if (!client) return;
      openContextMenu(e, [
        {
          label: t('common.rename'),
          icon: <PencilSimpleIcon size={14} />,
          onClick: async () => {
            const name = (
              await prompt({ title: t('room.sections.renameTitle'), defaultValue: section.name })
            )?.trim();
            if (name && name !== section.name) {
              client.renameRoomSection(section.tag, name).catch(sectionError);
            }
          },
        },
        ...moveItems(section.tag),
        { divider: true, label: '', onClick: () => {} },
        {
          label: t('room.sections.delete'),
          icon: <TrashIcon size={14} />,
          danger: true,
          onClick: async () => {
            const ok = await confirmDialog({
              title: t('room.sections.deleteTitle', { name: section.name }),
              message: t('room.sections.deleteMessage'),
              confirmLabel: t('room.sections.delete'),
              danger: true,
            });
            if (ok) client.deleteRoomSection(section.tag).catch(sectionError);
          },
        },
      ]);
    },
    [client, openContextMenu, prompt, confirmDialog, t, sectionError, moveItems]
  );

  const renderSectionHeader = (item: SectionListItem) => (
    <SortableHeaderRow id={`sec:${item.section.tag}`} draggable>
      <HomeCategoryHeader
        label={item.section.name}
        isClosed={isCollapsed(item.key)}
        onToggle={() => toggleCategory(item.key)}
        hasNotif={item.hasNotif}
        hasMention={item.hasMention}
        showAdd
        onAdd={() =>
          setCreateRoomOpen({
            open: true,
            spaceId: isSpaceView ? currentSpaceId : null,
            spaceName:
              isSpaceView && currentSpaceId
                ? (currentSpaceDetails?.name ?? currentSpaceEntry?.name ?? null)
                : null,
            sectionTag: item.section.tag,
          })
        }
        onMenu={(e) => openSectionMenu(e, item.section)}
      />
    </SortableHeaderRow>
  );

  const groupBySection = useCallback(
    <T,>(roomItems: T[], roomIdOf: (item: T) => string) => {
      const bySection = new Map<string, T[]>(sections.map((sec) => [sec.tag, []]));
      const rest: T[] = [];
      for (const item of roomItems) {
        const tag = getRoomSectionTag(roomTagNames.get(roomIdOf(item)), sections);
        if (tag) bySection.get(tag)!.push(item);
        else rest.push(item);
      }
      const visible = sections.filter(
        (sec) => bySection.get(sec.tag)!.length > 0 || sec.spaceId === sectionContext
      );
      return { bySection, rest, visible };
    },
    [roomTagNames, sections, sectionContext]
  );

  const callRoomId = callUi.roomId;
  const keepWhenClosed = useCallback(
    (roomId: string) => roomId === currentRoomId || roomId === callRoomId,
    [currentRoomId, callRoomId]
  );
  const keepVisible = useCallback(
    (roomId: string) => !draggingSection && keepWhenClosed(roomId),
    [draggingSection, keepWhenClosed]
  );

  const spaceItemsBase = useMemo((): SpaceListItem[] => {
    if (!isSpaceView || !currentSpaceId || !client) return [];
    const favSet = favouriteRooms;

    const favRooms: HierarchyRoomItem[] = [];
    const lowRooms: HierarchyRoomItem[] = [];
    const nonFav: HierarchyItem[] = [];
    for (const item of hierarchyItems) {
      if (item.kind === 'room' && favSet.has(item.roomId)) favRooms.push(item);
      else if (item.kind === 'room' && lowPriorityRooms.has(item.roomId)) lowRooms.push(item);
      else nonFav.push(item);
    }
    const grouped = groupBySection(nonFav, (i) => i.roomId);
    const sectioned = new Set([...grouped.bySection.values()].flat().map((i) => i.roomId));
    const rest = nonFav.filter((i) => i.kind !== 'room' || !sectioned.has(i.roomId));

    const sectionBlock = (above: boolean): SpaceListItem[] =>
      grouped.visible
        .filter((sec) => sec.aboveRooms === above)
        .flatMap((sec) => {
          const rooms = grouped.bySection
            .get(sec.tag)!
            .filter((i): i is HierarchyRoomItem => i.kind === 'room');
          const key = `${currentSpaceId}::${sec.tag}`;
          const closed = isCollapsed(key);
          const hasMention = rooms.some((r) => r.entry.hasNotif);
          const out: SpaceListItem[] = [
            {
              kind: 'section',
              key,
              section: sec,
              hasMention,
              hasNotif: hasMention || rooms.some((r) => r.entry.unreadCount > 0),
            },
          ];
          for (const room of rooms) {
            if (closed && !keepVisible(room.roomId)) continue;
            out.push({ kind: 'room', item: room, compact: closed });
          }
          return out;
        });

    const items: SpaceListItem[] = [];
    if (favRooms.length > 0 && spaceFavKey) {
      const favClosed = isCollapsed(spaceFavKey);
      const favHasMention = favRooms.some((r) => r.entry.hasNotif);
      const favHasNotif = favHasMention || favRooms.some((r) => r.entry.unreadCount > 0);
      items.push({
        kind: 'header',
        item: {
          kind: 'space',
          roomId: spaceFavKey,
          categoryKey: spaceFavKey,
          name: t('nav.favourites'),
          avatarMxc: null,
          hasNotif: favHasNotif,
          hasMention: favHasMention,
          isRoot: false,
          depth: 0,
        },
      });
      for (const room of sortFavourites(
        favRooms,
        (r) => r.roomId,
        (r) => r.entry.name
      )) {
        if (favClosed && !keepVisible(room.roomId)) continue;
        items.push({ kind: 'room', item: room, compact: favClosed });
      }
    }

    items.push(...sectionBlock(true));

    const hasRootSection = rest.some((i) => i.kind === 'space' && i.isRoot);
    // The Modern style has no "Rooms" heading: the space's own channels simply start the list.
    // Favourites and sections above the rooms need it to tell where they end.
    const hideRootHeader =
      modernList && favRooms.length === 0 && !grouped.visible.some((sec) => sec.aboveRooms);
    if (!hasRootSection && !hideRootHeader) {
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
      return keepVisible(h.roomId);
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
        // Without a heading the root can't be reopened, so Modern never collapses it
        const closed = !(hideRootHeader && head.isRoot) && isCollapsed(head.categoryKey);
        const fullyOpen = !closed;
        // A category stays listed while empty in Modern: it is how channels get put there
        if (fullyOpen || head.isRoot || chunk.length > 0 || modernList) {
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

    const collected = collect(rest);
    const split = collected.findIndex((it) => it.kind === 'header' && !it.item.isRoot);
    const roomsAndHeader = split === -1 ? collected : collected.slice(0, split);
    const roomsPart = hideRootHeader
      ? roomsAndHeader.filter((it) => !(it.kind === 'header' && it.item.isRoot))
      : roomsAndHeader;
    const subspacePart = split === -1 ? [] : collected.slice(split);

    const lowBlock: SpaceListItem[] = [];
    if (lowRooms.length > 0 && spaceLowKey) {
      const lowClosed = isCollapsed(spaceLowKey);
      const lowHasMention = lowRooms.some((r) => r.entry.hasNotif);
      const lowHasNotif = lowHasMention || lowRooms.some((r) => r.entry.unreadCount > 0);
      lowBlock.push({
        kind: 'header',
        item: {
          kind: 'space',
          roomId: spaceLowKey,
          categoryKey: spaceLowKey,
          name: t('room.lowPriority'),
          avatarMxc: null,
          hasNotif: lowHasNotif,
          hasMention: lowHasMention,
          isRoot: false,
          depth: 0,
        },
      });
      for (const room of lowRooms) {
        if (lowClosed && !keepVisible(room.roomId)) continue;
        lowBlock.push({ kind: 'room', item: room, compact: lowClosed });
      }
    }
    return items.concat(roomsPart, sectionBlock(false), subspacePart, lowBlock);
  }, [
    modernList,
    groupBySection,
    isCollapsed,
    isSpaceView,
    currentSpaceId,
    client,
    favouriteRooms,
    lowPriorityRooms,
    spaceLowKey,
    hierarchyItems,
    keepVisible,
    spaceFavKey,
    favouriteOrdersVersion,
    t,
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

  const listedRoomIds = useMemo(() => {
    if (isDmView) return dms.map((d) => d.roomId);
    if (isSpaceView) {
      return spaceItemsBase
        .filter((i): i is Extract<SpaceListItem, { kind: 'room' }> => i.kind === 'room')
        .map((i) => i.item.roomId);
    }
    return homeRooms.map((r) => r.roomId);
  }, [isDmView, isSpaceView, spaceItemsBase, dms, homeRooms]);

  const pendingCallRoomId = useAtomValue(pendingCallRoomIdAtom);
  const joiningRoomId = pendingCallRoomId ?? (callUi.phase !== 'idle' ? callUi.roomId : null);
  const myUserId = client?.userId() ?? null;
  const [leavingRoomId, setLeavingRoomId] = useAtom(leavingCallRoomIdAtom);
  const leavingStillListed = !!leavingRoomId && !!roomsById.get(leavingRoomId)?.inCall;

  useEffect(() => {
    if (leavingRoomId && !leavingStillListed) setLeavingRoomId(null);
  }, [leavingRoomId, leavingStillListed, setLeavingRoomId]);

  // Our own join and leave show right away, before the membership change syncs
  const callParticipantsByRoom = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const roomId of listedRoomIds) {
      const room = roomsById.get(roomId);
      if (!room) continue;
      let userIds = room.callParticipants;
      if (roomId === leavingRoomId && leavingStillListed) {
        userIds = userIds.filter((userId) => userId !== myUserId);
      }
      if (roomId === joiningRoomId && myUserId && room.isVoice && !userIds.includes(myUserId)) {
        userIds = [...userIds, myUserId];
      }
      if (userIds.length > 0) map.set(roomId, userIds);
    }
    return map;
  }, [listedRoomIds, roomsById, leavingRoomId, leavingStillListed, joiningRoomId, myUserId]);

  const participantCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const roomId of voiceRoomIds) {
      const count = callParticipantsByRoom.get(roomId)?.length ?? 0;
      if (count > 0) map.set(roomId, count);
    }
    return map;
  }, [callParticipantsByRoom, voiceRoomIds]);

  const getRoomEntryHeight = useCallback(
    (entry: RoomEntry, compact?: boolean) => {
      if (!entry.hasVoiceRoom) return roomItemHeight;
      const count = participantCounts.get(entry.roomId) ?? 0;
      return roomItemHeight + computeParticipantsBlockHeight(count, compact, touchUi);
    },
    [participantCounts, roomItemHeight, touchUi]
  );

  const homeItemsBase = useMemo((): HomeListItem[] => {
    if (isSpaceView || isDmView || !client) return [];
    const favSet = favouriteRooms;

    const favEntries: RoomEntry[] = [];
    for (const entry of homeRooms) {
      if (favSet.has(entry.roomId)) {
        favEntries.push(entry);
      }
    }

    const lowEntries = homeRooms.filter(
      (entry) => !favSet.has(entry.roomId) && lowPriorityRooms.has(entry.roomId)
    );
    const grouped = groupBySection(
      homeRooms.filter((entry) => !favSet.has(entry.roomId) && !lowPriorityRooms.has(entry.roomId)),
      (e) => e.roomId
    );
    const otherEntries = grouped.rest;
    const pushSections = (above: boolean) => {
      for (const sec of grouped.visible.filter((x) => x.aboveRooms === above)) {
        const entries = grouped.bySection.get(sec.tag)!;
        const key = `${HOME_SPACE}::${sec.tag}`;
        const closed = isCollapsed(key);
        const hasMention = entries.some((entry) => entry.hasNotif);
        items.push({
          kind: 'section',
          key,
          section: sec,
          hasMention,
          hasNotif: hasMention || entries.some((entry) => entry.unreadCount > 0),
        });
        for (const entry of entries) {
          if (closed && !keepVisible(entry.roomId)) continue;
          items.push({ kind: 'room', entry, compact: closed });
        }
      }
    };

    const items: HomeListItem[] = [];
    const pushSection = (itemKey: string, entries: RoomEntry[]) => {
      const hasMention = entries.some((entry) => entry.hasNotif);
      const hasNotif = hasMention || entries.some((entry) => entry.unreadCount > 0);
      items.push({
        kind: 'header',
        itemKey,
        label:
          itemKey === HOME_FAVOURITES_CATEGORY
            ? t('nav.favourites')
            : itemKey === HOME_LOW_PRIORITY_CATEGORY
              ? t('room.lowPriority')
              : t('nav.rooms'),
        hasNotif,
        hasMention,
        showAdd: itemKey === HOME_ROOMS_CATEGORY,
      });
      const closed = isCollapsed(itemKey);
      for (const entry of entries) {
        if (closed && !keepVisible(entry.roomId)) continue;
        items.push({ kind: 'room', entry, compact: closed });
      }
    };

    if (favEntries.length > 0) {
      pushSection(
        HOME_FAVOURITES_CATEGORY,
        sortFavourites(
          favEntries,
          (e) => e.roomId,
          (e) => e.name
        )
      );
    }
    pushSections(true);
    pushSection(HOME_ROOMS_CATEGORY, otherEntries);
    pushSections(false);
    if (lowEntries.length > 0) pushSection(HOME_LOW_PRIORITY_CATEGORY, lowEntries);
    return items;
  }, [
    groupBySection,
    isCollapsed,
    isSpaceView,
    isDmView,
    client,
    favouriteRooms,
    lowPriorityRooms,
    homeRooms,
    keepVisible,
    favouriteOrdersVersion,
    t,
  ]);

  const parentSpaceIds = useMemo(
    () =>
      Array.from(
        new Set([
          ...spaceItemsBase.flatMap((it) => (it.kind === 'room' ? [it.item.parentSpaceId] : [])),
          // Modern: a category may be empty yet still take rooms and be moved
          ...(modernList ? [...categoryParents.keys(), ...categoryParents.values()] : []),
        ])
      ),
    [spaceItemsBase, modernList, categoryParents]
  );
  const parentSpaceSettings = useQueries({
    queries: parentSpaceIds.map((spaceId) => ({
      queryKey: queryKeys.roomSettings(spaceId),
      queryFn: () => client!.roomSettings(spaceId),
      enabled: !!client,
      staleTime: 30_000,
    })),
  });
  const canEditSpace = useMemo(() => {
    const userId = client?.userId() ?? '';
    const allowed = new Set<string>();
    parentSpaceIds.forEach((spaceId, i) => {
      if (canSendState(parentSpaceSettings[i]?.data, userId, 'm.space.child')) allowed.add(spaceId);
    });
    return allowed;
  }, [client, parentSpaceIds, parentSpaceSettings]);

  // Sending a person from one voice channel to another needs a space above both that the user
  // manages (the spaces known here are those of the rooms on screen).
  const manageableAbove = useCallback(
    (roomId: string) => manageableAncestors(spaceGraph, canEditSpace, roomId),
    [spaceGraph, canEditSpace]
  );
  const canMoveVoiceUsersFrom = useCallback(
    (roomId: string) => manageableAbove(roomId).size > 0,
    [manageableAbove]
  );
  const canMoveParticipant = useCallback(
    (fromRoomId: string, toRoomId: string) => {
      const above = manageableAbove(toRoomId);
      return [...manageableAbove(fromRoomId)].some((id) => above.has(id));
    },
    [manageableAbove]
  );
  const handleMoveParticipant = useCallback(
    (userId: string, fromRoomId: string, toRoomId: string) => {
      if (!client) return;
      moveVoiceUser(client, fromRoomId, userId, toRoomId).catch((err: unknown) =>
        toast.error(t('room.moveFailed', { error: getErrorMessage(err) }))
      );
    },
    [client, toast, t]
  );

  const spaceReorderRows = useCallback(
    (items: SpaceListItem[]): ReorderRow[] => {
      const rows: ReorderRow[] = [];
      let headerKey: string | null = null;
      // Modern with no "Rooms" heading: the rooms before the first heading are the space's own
      let group: string | null = modernList && currentSpaceId ? `cat:${currentSpaceId}` : null;
      for (const it of items) {
        if (it.kind === 'header') {
          headerKey = it.item.categoryKey;
          // Modern: each category is a group of its own, so a room dropped on another category's
          // row moves there
          group =
            headerKey === spaceFavKey
              ? 'fav'
              : headerKey === spaceLowKey
                ? 'low'
                : modernList
                  ? `cat:${it.item.roomId}`
                  : it.item.isRoot
                    ? 'rooms'
                    : 'subspaces';
          const parent = categoryParents.get(it.item.roomId);
          rows.push({
            id: `hdr:${headerKey}`,
            kind: 'header',
            group,
            section: null,
            anchor: it.item.isRoot ? ROOMS_ANCHOR : undefined,
            category:
              modernList && parent && canEditSpace.has(parent)
                ? { id: it.item.roomId, parent }
                : undefined,
            label: it.item.name,
          });
          continue;
        }
        if (it.kind === 'section') {
          headerKey = SECTION_ROWS;
          group = `section:${it.section.tag}`;
          rows.push({
            id: `sec:${it.section.tag}`,
            kind: 'header',
            group,
            section: null,
            anchor: it.section.tag,
            label: it.section.name,
          });
          continue;
        }
        if (headerKey === SECTION_ROWS) {
          rows.push({
            id: it.item.roomId,
            kind: 'room',
            group,
            section: null,
            label: it.item.entry.name,
            voice: it.item.entry.hasVoiceRoom,
          });
          continue;
        }
        const isFavourite = headerKey !== null && headerKey === spaceFavKey;
        const closed = headerKey !== null && closedCategories.has(headerKey);
        const isLow = headerKey !== null && headerKey === spaceLowKey;
        const allowed =
          !closed && !isLow && (isFavourite || canEditSpace.has(it.item.parentSpaceId));
        rows.push({
          id: it.item.roomId,
          kind: 'room',
          group,
          section: allowed ? (isFavourite ? 'fav' : `space:${it.item.parentSpaceId}`) : null,
          label: it.item.entry.name,
          voice: it.item.entry.hasVoiceRoom,
        });
      }
      return rows;
    },
    [
      canEditSpace,
      spaceFavKey,
      spaceLowKey,
      closedCategories,
      modernList,
      categoryParents,
      currentSpaceId,
    ]
  );

  const homeReorderRows = useCallback(
    (items: HomeListItem[]): ReorderRow[] => {
      const rows: ReorderRow[] = [];
      let headerKey: string | null = null;
      let group: string | null = null;
      for (const it of items) {
        if (it.kind === 'header') {
          headerKey = it.itemKey;
          group =
            headerKey === HOME_FAVOURITES_CATEGORY
              ? 'fav'
              : headerKey === HOME_LOW_PRIORITY_CATEGORY
                ? 'low'
                : 'rooms';
          rows.push({
            id: `hdr:${headerKey}`,
            kind: 'header',
            group,
            section: null,
            anchor: headerKey === HOME_ROOMS_CATEGORY ? ROOMS_ANCHOR : undefined,
            label: it.label,
          });
          continue;
        }
        if (it.kind === 'section') {
          headerKey = SECTION_ROWS;
          group = `section:${it.section.tag}`;
          rows.push({
            id: `sec:${it.section.tag}`,
            kind: 'header',
            group,
            section: null,
            anchor: it.section.tag,
            label: it.section.name,
          });
          continue;
        }
        if (headerKey === SECTION_ROWS) {
          rows.push({
            id: it.entry.roomId,
            kind: 'room',
            group,
            section: null,
            label: it.entry.name,
            voice: it.entry.hasVoiceRoom,
          });
          continue;
        }
        const closed = headerKey !== null && closedCategories.has(headerKey);
        rows.push({
          id: it.entry.roomId,
          kind: 'room',
          group,
          section:
            closed || headerKey === HOME_LOW_PRIORITY_CATEGORY
              ? null
              : headerKey === HOME_FAVOURITES_CATEGORY
                ? 'fav'
                : 'home',
          label: it.entry.name,
          voice: it.entry.hasVoiceRoom,
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
        rows.filter((r) => pendingOrder && r.section === pendingOrder.section).map((r) => r.id)
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
  // The categories the user may move (Modern), by space id
  const categoryRowOf = useMemo(
    () =>
      new Map(
        reorderRows.flatMap((r) =>
          r.kind === 'header' && r.category ? [[r.category.id, r.category] as const] : []
        )
      ),
    [reorderRows]
  );
  visibleAnchorsRef.current = reorderRows.reduce<string[]>((list, row) => {
    if (row.kind !== 'header') return list;
    if (row.anchor && !list.includes(row.anchor)) list.push(row.anchor);
    return list;
  }, []);

  useEffect(() => {
    if (!pendingOrder) return;
    const base = isSpaceView ? spaceReorderRows(spaceItemsBase) : homeReorderRows(homeItemsBase);
    const synced = base.filter((r) => r.section === pendingOrder.section).map((r) => r.id);
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
        const children = childrenOf(spaceGraph, spaceId);
        if (children.length === 0) return;
        const orders = new Map(
          children.map((c) => [c.roomId, isValidSpaceOrder(c.order) ? c.order : undefined])
        );
        const updates = planSpaceReorder(orderedIds, orders, movedId);
        save = saveSpaceChildOrders(client, spaceId, updates);
      }
      save.catch((err: unknown) => {
        setPendingOrder(null);
        toast.error(t('nav.reorderFailed', { error: getErrorMessage(err) }));
      });
    },
    [client, spaceGraph, toast, t]
  );

  const handleMoveRoom = useCallback(
    (roomId: string, group: string) => {
      if (!client) return;
      let save: Promise<unknown>;
      // Low priority is its own group: leaving it for another one takes the tag off first
      const leaveLow = (): Promise<void> =>
        lowPriorityRooms.has(roomId) ? client.setLowPriority(roomId, false) : Promise.resolve();
      if (group === 'low') {
        save = client.setRoomSection(roomId, null).then(() => client.setLowPriority(roomId, true));
      } else if (group === 'fav') {
        save = client.setRoomSection(roomId, null).then(() => client.setFavourite(roomId, true));
      } else if (group === 'rooms' || group === 'subspaces') {
        save = leaveLow().then(() => client.setRoomSection(roomId, null));
      } else if (group.startsWith('section:')) {
        save = leaveLow().then(() => client.setRoomSection(roomId, group.slice('section:'.length)));
      } else if (group.startsWith('cat:')) {
        // Modern: dropped in another category (or the space itself). Both ends must be ones the
        // user may change; a room that is not in the list yet has nowhere to move from.
        const target = group.slice('cat:'.length);
        const from = hierarchyItems.find(
          (it): it is HierarchyRoomItem => it.kind === 'room' && it.roomId === roomId
        )?.parentSpaceId;
        if (!from || from === target || !canEditSpace.has(from) || !canEditSpace.has(target))
          return;
        save = moveRoomToCategory(client, spaceGraph, roomId, from, target).catch((err: unknown) =>
          toast.error(t('room.moveFailed', { error: getErrorMessage(err) }))
        );
      } else {
        return;
      }
      save.catch(sectionError);
    },
    [client, sectionError, hierarchyItems, canEditSpace, spaceGraph, toast, t, lowPriorityRooms]
  );

  // Modern style: a room's menu moves it up or down among the rooms of its category, or to another
  // category (the same changes dragging makes).
  const { movable, categoriesOf } = useMemo(() => {
    const movableRooms = new Map<string, { section: string; ids: string[]; index: number }>();
    const targets = new Map<string, { id: string; name: string }[]>();
    if (!modernList || !isSpaceView) return { movable: movableRooms, categoriesOf: targets };
    const bySection = new Map<string, string[]>();
    for (const row of reorderRows) {
      if (row.kind !== 'room' || !row.section?.startsWith('space:')) continue;
      bySection.set(row.section, [...(bySection.get(row.section) ?? []), row.id]);
    }
    for (const [section, ids] of bySection) {
      ids.forEach((id, index) => movableRooms.set(id, { section, ids, index }));
    }
    // The space's own level has no heading here but is still somewhere a room can go.
    const headers = hierarchyItems.filter((it): it is HierarchySpaceItem => it.kind === 'space');
    for (const it of spaceItems) {
      if (it.kind !== 'room' || !movableRooms.has(it.item.roomId)) continue;
      targets.set(
        it.item.roomId,
        headers
          .filter((h) => h.roomId !== it.item.parentSpaceId && canEditSpace.has(h.roomId))
          .map((h) => ({ id: h.roomId, name: h.isRoot ? t('room.noCategory') : h.name }))
      );
    }
    return { movable: movableRooms, categoriesOf: targets };
  }, [modernList, isSpaceView, reorderRows, hierarchyItems, spaceItems, canEditSpace, t]);

  const moveRoom = useCallback(
    (roomId: string, direction: -1 | 1) => {
      const at = movable.get(roomId);
      if (!at) return;
      const next = [...at.ids];
      const to = at.index + direction;
      if (to < 0 || to >= next.length) return;
      [next[at.index], next[to]] = [next[to], next[at.index]];
      handleReorder(at.section, next, roomId);
    },
    [movable, handleReorder]
  );

  const moveToCategory = useCallback(
    (roomId: string, targetSpaceId: string) => handleMoveRoom(roomId, `cat:${targetSpaceId}`),
    [handleMoveRoom]
  );

  const handleReorderCategories = useCallback(
    (parentId: string, orderedIds: string[], movedId: string) => {
      if (!client) return;
      const node = spaceGraph.find((s) => s.spaceId === parentId);
      saveSpaceChildrenOrder(client, node, orderedIds, movedId).catch((err: unknown) =>
        toast.error(t('nav.reorderFailed', { error: getErrorMessage(err) }))
      );
    },
    [client, spaceGraph, toast, t]
  );

  // Modern: a category's menu moves it among the categories of the same space
  const openCategoryMenu = useCallback(
    (e: React.MouseEvent, category: HierarchySpaceItem) => {
      const parent = categoryParents.get(category.roomId);
      if (!client || !parent || !canEditSpace.has(parent)) return;
      const siblings = [...categoryParents].filter(([, p]) => p === parent).map(([id]) => id);
      const index = siblings.indexOf(category.roomId);
      const move = (delta: -1 | 1) => {
        const next = [...siblings];
        [next[index], next[index + delta]] = [next[index + delta], next[index]];
        handleReorderCategories(parent, next, category.roomId);
      };
      openContextMenu(e, [
        {
          label: t('room.moveUp'),
          icon: <ArrowUpIcon size={14} />,
          disabled: index <= 0,
          onClick: () => move(-1),
        },
        {
          label: t('room.moveDown'),
          icon: <ArrowDownIcon size={14} />,
          disabled: index === -1 || index >= siblings.length - 1,
          onClick: () => move(1),
        },
      ]);
    },
    [client, categoryParents, canEditSpace, openContextMenu, handleReorderCategories, t]
  );

  const handleReorderSections = useCallback(
    (anchors: string[]) => {
      if (client) client.setRoomSectionOrder(anchors).catch(sectionError);
    },
    [client, sectionError]
  );

  const renderDropBlock = (virtualizer: {
    measurementsCache: { start: number; end: number }[];
  }) => {
    if (!dropGroup) return null;
    const first = reorderRows.findIndex((r) => r.group === dropGroup);
    const last =
      reorderRows.length - 1 - [...reorderRows].reverse().findIndex((r) => r.group === dropGroup);
    const top = virtualizer.measurementsCache[first]?.start;
    const bottom = virtualizer.measurementsCache[last]?.end;
    if (first === -1 || top === undefined || bottom === undefined) return null;
    return <div className={reorderCss.dropBlock} style={{ top, height: bottom - top }} />;
  };

  const renderReorderOverlay = (roomId: string) => {
    if (roomId === roomsHeaderId) {
      return <HomeCategoryHeader label={t('nav.rooms')} isClosed={false} onToggle={noop} />;
    }
    if (roomId.startsWith('sec:')) {
      const tag = roomId.slice('sec:'.length);
      const name = sections.find((sec) => sec.tag === tag)?.name ?? '';
      return <HomeCategoryHeader label={name} isClosed={false} onToggle={noop} />;
    }
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
        hasActiveCall={callParticipantsByRoom.has(roomId) && !entry.hasVoiceRoom}
        isInCall={callUi.roomId === roomId}
        voiceMembers={callParticipantsByRoom.get(roomId)}
        onSelect={noop}
        onOpenChat={noop}
        onOpenChatOnly={noop}
      />
    );
  };

  const currentSpaceDetails = useRoomDetails(isSpaceView ? currentSpaceId : null);

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
      if (item.kind !== 'room') return categoryHeaderHeight;
      return getRoomEntryHeight(item.item.entry, item.compact);
    },
    getItemKey: (index) => {
      const item = spaceItems[index];
      if (item.kind === 'section') return `section-${item.key}`;
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
      return item.kind !== 'room'
        ? categoryHeaderHeight
        : getRoomEntryHeight(item.entry, item.compact);
    },
    getItemKey: (index) => {
      const item = homeItems[index];
      if (item.kind === 'section') return `section-${item.key}`;
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
      const room = roomsById.get(roomId);
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
        if (isMobile) setVoicePreviewId(roomId);
        else onVoiceJoin(roomId);
        return;
      }
      navigateToRoom();
    },
    [
      setCurrentRoomId,
      navigate,
      sidebarView,
      currentSpaceId,
      roomsById,
      callUi.roomId,
      callActions,
      onVoiceJoin,
      setDrawerOpen,
      isMobile,
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
        const room = roomsById.get(roomId);
        if (room && !room.isInvite && isVoiceRoom(room)) onVoiceJoin(roomId);
      }
    },
    [
      setCurrentRoomId,
      navigate,
      sidebarView,
      currentSpaceId,
      client,
      roomsById,
      callUi.roomId,
      onVoiceJoin,
      setDrawerOpen,
    ]
  );

  const isSpaceContext = sidebarView === 'space' && !!currentSpaceId;
  const headerLabel = isDmView
    ? t('room.dm.directMessages')
    : isSpaceContext
      ? (currentSpaceDetails?.name ?? currentSpaceEntry?.name ?? t('nav.home'))
      : t('nav.home');

  const renderSpaceList = () => {
    return (
      <div ref={roomListRef} className={css.roomList}>
        <RoomReorderProvider
          rows={reorderRows}
          onReorder={handleReorder}
          onMoveRoom={handleMoveRoom}
          onReorderSections={handleReorderSections}
          onReorderCategories={handleReorderCategories}
          canMoveParticipant={canMoveParticipant}
          onMoveParticipant={handleMoveParticipant}
          onActiveChange={(id) =>
            setDraggingSection(!!id && (id.startsWith('sec:') || id === roomsHeaderId))
          }
          onDropGroupChange={setDropGroup}
          renderOverlay={renderReorderOverlay}
        >
          <div style={{ height: spaceVirtualizer.getTotalSize(), position: 'relative' }}>
            {renderDropBlock(spaceVirtualizer)}
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
                  {item.kind === 'section' ? (
                    renderSectionHeader(item)
                  ) : item.kind === 'header' ? (
                    <SortableHeaderRow
                      id={`hdr:${item.item.categoryKey}`}
                      draggable={
                        item.item.isRoot ||
                        (modernList && categoryRowOf.get(item.item.roomId) !== undefined)
                      }
                      droppable={modernList && canEditSpace.has(item.item.roomId)}
                    >
                      {spaceFavKey && item.item.categoryKey === spaceFavKey ? (
                        <HomeCategoryHeader
                          label={item.item.name}
                          isClosed={isCollapsed(spaceFavKey)}
                          onToggle={() => toggleCategory(spaceFavKey)}
                          hasNotif={item.item.hasNotif}
                          hasMention={item.item.hasMention}
                        />
                      ) : (
                        <SubspaceCategoryHeader
                          item={item.item}
                          isClosed={isCollapsed(item.item.categoryKey)}
                          onToggle={toggleCategory}
                          onAdd={handleSubspaceAdd}
                          onMenu={
                            item.item.isRoot
                              ? openRoomsMenu
                              : modernList && categoryRowOf.get(item.item.roomId)
                                ? (e) => openCategoryMenu(e, item.item)
                                : undefined
                          }
                          client={client}
                          showAvatar={showRoomAvatars && !modernList}
                        />
                      )}
                    </SortableHeaderRow>
                  ) : (
                    <SortableRoomRow roomId={item.item.roomId} disabled={false}>
                      <RoomListItem
                        entry={item.item.entry}
                        isActive={currentRoomId === item.item.roomId}
                        hasActiveCall={
                          callParticipantsByRoom.has(item.item.roomId) &&
                          !item.item.entry.hasVoiceRoom
                        }
                        isInCall={callUi.roomId === item.item.roomId}
                        voiceMembers={callParticipantsByRoom.get(item.item.roomId)}
                        canMoveVoiceUsers={canMoveVoiceUsersFrom(item.item.roomId)}
                        canMoveUp={(movable.get(item.item.roomId)?.index ?? 0) > 0}
                        canMoveDown={
                          (movable.get(item.item.roomId)?.index ?? 0) <
                          (movable.get(item.item.roomId)?.ids.length ?? 0) - 1
                        }
                        onMove={movable.has(item.item.roomId) ? moveRoom : undefined}
                        categoryTargets={categoriesOf.get(item.item.roomId)}
                        onMoveToCategory={
                          categoriesOf.has(item.item.roomId) ? moveToCategory : undefined
                        }
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
          onMoveRoom={handleMoveRoom}
          onReorderSections={handleReorderSections}
          canMoveParticipant={canMoveParticipant}
          onMoveParticipant={handleMoveParticipant}
          onActiveChange={(id) =>
            setDraggingSection(!!id && (id.startsWith('sec:') || id === roomsHeaderId))
          }
          onDropGroupChange={setDropGroup}
          renderOverlay={renderReorderOverlay}
        >
          <div style={{ height: homeVirtualizer.getTotalSize(), position: 'relative' }}>
            {renderDropBlock(homeVirtualizer)}
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
                  {item.kind === 'section' ? (
                    renderSectionHeader(item)
                  ) : item.kind === 'header' ? (
                    <SortableHeaderRow
                      id={`hdr:${item.itemKey}`}
                      draggable={item.itemKey === HOME_ROOMS_CATEGORY}
                    >
                      <HomeCategoryHeader
                        label={item.label}
                        isClosed={isCollapsed(item.itemKey)}
                        onToggle={() => toggleCategory(item.itemKey)}
                        hasNotif={item.hasNotif}
                        hasMention={item.hasMention}
                        showAdd={item.showAdd}
                        onAdd={handleHomeAdd}
                        onMenu={item.itemKey === HOME_ROOMS_CATEGORY ? openRoomsMenu : undefined}
                      />
                    </SortableHeaderRow>
                  ) : (
                    <SortableRoomRow roomId={item.entry.roomId} disabled={false}>
                      <RoomListItem
                        entry={item.entry}
                        isActive={currentRoomId === item.entry.roomId}
                        hasActiveCall={
                          callParticipantsByRoom.has(item.entry.roomId) && !item.entry.hasVoiceRoom
                        }
                        isInCall={callUi.roomId === item.entry.roomId}
                        voiceMembers={callParticipantsByRoom.get(item.entry.roomId)}
                        canMoveVoiceUsers={canMoveVoiceUsersFrom(item.entry.roomId)}
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
          <div className={css.emptyList}>{t('nav.noDms')}</div>
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
                  hasActiveCall={callParticipantsByRoom.has(entry.roomId)}
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
      {isSpaceView && spaceBanner && (
        <SpaceBannerView client={client} banner={spaceBanner} className={bannerCss.headerBanner} />
      )}
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

      {!isDmView && !isSpaceView && (
        <button
          type="button"
          className={currentRoomId === null ? css.homeLinkActive : css.homeLink}
          aria-current={currentRoomId === null ? 'page' : undefined}
          onClick={() => {
            setDrawerOpen(false);
            navigate('/', { state: { sidebarView: 'home', currentSpaceId: null } });
          }}
        >
          <HouseIcon size={18} weight={currentRoomId === null ? 'fill' : 'regular'} />
          <span className={css.homeLinkLabel}>{t('nav.home')}</span>
        </button>
      )}

      {isDmView ? renderDmList() : isSpaceView ? renderSpaceList() : renderHomeList()}

      <div ref={bottomDockRef} className={css.bottomDock}>
        <CallBar />
        <UserPanel />
      </div>
      {voicePreviewId && client && (
        <VoiceJoinSheet
          client={client}
          roomId={voicePreviewId}
          onClose={() => setVoicePreviewId(null)}
          onJoin={() => {
            onVoiceJoin(voicePreviewId);
            setVoicePreviewId(null);
          }}
        />
      )}
    </div>
  );
}
