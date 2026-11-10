import { useCallback, useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAtom, useSetAtom } from 'jotai';
import type { WizardClient } from '@wizardchat/core';
import { useTranslation } from 'react-i18next';
import {
  PlusIcon,
  UserPlusIcon,
  GearIcon,
  SignOutIcon,
  UsersIcon,
  XIcon,
  DotsThreeVerticalIcon,
  CaretDownIcon,
  CubeIcon,
  StackIcon,
  HashStraightIcon,
  PushPinIcon,
  StarIcon,
  CaretDoubleRightIcon,
} from '@phosphor-icons/react';
import { Avatar } from '@/app/components/Avatar';
import { Button, IconButton } from '@/app/components/Button';
import {
  currentRoomIdAtom,
  createRoomOpenAtom,
  createSpaceOpenAtom,
  addRoomToSpaceAtom,
  roomSettingsRoomIdAtom,
  spaceSettingsRoomIdAtom,
  spaceMembersPanelOpenAtom,
  openLobbyCategoriesAtom,
  pinnedSubSpacesAtom,
} from '@/app/store/atoms';
import { getMatrixClientOrNull } from '@/client/initMatrix';
import {
  childrenOf,
  queryKeys,
  useAllRooms,
  useAllJoinedSpaces,
  useRoomDetails,
  useSpaceGraph,
} from '@/app/data';
import {
  useSpaceRoomsGrouped,
  splitHierarchyLevel,
} from '@/app/features/room/useSpaceRoomsGrouped';
import {
  getCachedSpaceHierarchy,
  loadSpaceHierarchy,
  type RoomSummary,
} from '@/app/features/space/spaceHierarchy';
import { useQueryClient } from '@tanstack/react-query';
import type { SpaceSection } from '@/app/features/room/useSpaceRoomsGrouped';
import { useRoomActions } from './hooks/useRoomActions';
import { useToast } from '@/app/hooks/useToast';
import { useContextMenu } from '@/app/hooks/useContextMenu';
import { useContextMenuTrigger } from '@/app/hooks/useContextMenuTrigger';
import { useThrottle } from '@/app/hooks/useThrottle';
import { Tooltip } from '@/app/components/Tooltip';
import type { ContextMenuItem } from '@/app/features/contextMenu/contextMenuAtom';
import type { SpaceRoomEntry } from '@/app/features/room/useSpaceRoomsGrouped';
import { getErrorMessage } from '@/util/error';
import { planSpaceReorder, saveSpaceChildOrders } from '@/app/features/room/roomOrder';
import { useCanSendState } from '@/app/hooks/useCanSendState';
import { RoomReorderProvider, SortableRoomRow } from './RoomReorder';
import * as css from './SpaceOverview.css';

const SPACE_CHILD = 'm.space.child';

function joinVia(client: WizardClient, roomId: string, viaServers: string[]) {
  return client.join(roomId, viaServers.length > 0 ? viaServers : null);
}

interface SpaceOverviewProps {
  spaceId: string;
}

interface RoomRowProps {
  entry: SpaceRoomEntry;
  parentSpaceId: string;
  joiningRooms: Set<string>;
  onSelect: (roomId: string) => void;
  onJoin: (roomId: string, name: string, viaServers: string[]) => void;
  onKnock: (roomId: string, viaServers: string[]) => void;
  buildRoomMenu: (entry: SpaceRoomEntry, fromSpaceId: string) => ContextMenuItem[];
}

// A single room row
function RoomRow({
  entry,
  parentSpaceId,
  joiningRooms,
  onSelect,
  onJoin,
  onKnock,
  buildRoomMenu,
}: RoomRowProps) {
  const { t } = useTranslation();
  const { openContextMenu } = useContextMenu();
  const client = getMatrixClientOrNull();
  const isBusy = joiningRooms.has(entry.roomId);
  const hasMeta = entry.memberCount > 0 || !!entry.topic;

  const menuTrigger = useContextMenuTrigger(() =>
    entry.isJoined ? buildRoomMenu(entry, parentSpaceId) : []
  );

  return (
    <div
      {...menuTrigger}
      className={entry.isJoined ? css.roomRowClickable : css.roomRow}
      onClick={entry.isJoined ? () => onSelect(entry.roomId) : undefined}
    >
      <Avatar name={entry.name} mxcUrl={entry.avatarMxc} client={client ?? undefined} size="sm" />

      <div className={css.roomInfo}>
        <div className={css.roomName}>
          {entry.name}
          {entry.isSuggested && (
            <Tooltip content={t('room.suggested')}>
              <span className={css.suggestedBadge}>
                <StarIcon size={14} weight="fill" />
              </span>
            </Tooltip>
          )}
        </div>
        {hasMeta && (
          <div className={css.roomMeta}>
            {entry.memberCount > 0 && (
              <span className={css.memberCount}>
                <UsersIcon size={10} />
                {entry.memberCount}
              </span>
            )}
            {entry.memberCount > 0 && entry.topic && <span className={css.metaDivider} />}
            {entry.topic && <span className={css.roomTopicText}>{entry.topic}</span>}
          </div>
        )}
      </div>

      {entry.isKnocking ? (
        <>
          <div className={css.roomRowDivider} />
          <div className={css.roomRowActions} onClick={(e) => e.stopPropagation()}>
            <Button variant="secondary" size="sm" disabled>
              {t('explore.knocking')}
            </Button>
          </div>
        </>
      ) : !entry.isJoined ? (
        <>
          <div className={css.roomRowDivider} />
          <div className={css.roomRowActions} onClick={(e) => e.stopPropagation()}>
            {entry.joinRule === 'knock' ? (
              <Button
                variant="secondary"
                size="sm"
                loading={isBusy}
                onClick={() => onKnock(entry.roomId, entry.viaServers)}
              >
                {t('explore.knock')}
              </Button>
            ) : (
              <Button
                variant="secondary"
                size="sm"
                loading={isBusy}
                onClick={() => onJoin(entry.roomId, entry.name, entry.viaServers)}
              >
                {t('explore.join')}
              </Button>
            )}
          </div>
        </>
      ) : (
        <div className={css.roomRowActions} onClick={(e) => e.stopPropagation()}>
          <IconButton
            size="sm"
            tooltip={t('room.open')}
            aria-label={t('room.open')}
            onClick={(e) => {
              e.stopPropagation();
              onSelect(entry.roomId);
            }}
          >
            <CaretDoubleRightIcon size={16} weight="bold" />
          </IconButton>
          <IconButton
            size="sm"
            tooltip={t('common.more')}
            aria-label={t('common.more')}
            onClick={(e) => openContextMenu(e, buildRoomMenu(entry, parentSpaceId))}
          >
            <DotsThreeVerticalIcon size={16} weight="bold" />
          </IconButton>
        </div>
      )}
    </div>
  );
}

interface SpaceSectionViewProps {
  section: SpaceSection;
  rootSpaceId: string;
  isOpen: boolean;
  onToggle: (key: string) => void;
  canAddRoom: boolean;
  joiningRooms: Set<string>;
  buildSubSpaceMenu: (section: SpaceSection) => ContextMenuItem[];
  buildAddMenu: (spaceId: string, spaceName: string) => ContextMenuItem[];
  onSelect: (roomId: string) => void;
  onJoin: (roomId: string, name: string, viaServers: string[]) => void;
  onKnock: (roomId: string, viaServers: string[]) => void;
  onJoinSpace: (spaceId: string, viaServers: string[]) => void;
  buildRoomMenu: (entry: SpaceRoomEntry, fromSpaceId: string) => ContextMenuItem[];
  onOpenSubSpace: (spaceId: string) => void;
  onSubSpacesFound: (sections: SpaceSection[]) => void;
}

const noop = () => {};

function SpaceSectionView({
  section,
  rootSpaceId,
  isOpen,
  onToggle,
  canAddRoom,
  joiningRooms,
  buildSubSpaceMenu,
  buildAddMenu,
  onSelect,
  onJoin,
  onKnock,
  onJoinSpace,
  buildRoomMenu,
  onOpenSubSpace,
  onSubSpacesFound,
}: SpaceSectionViewProps) {
  const { t } = useTranslation();
  const client = getMatrixClientOrNull();

  const { openContextMenu } = useContextMenu();
  const isRoot = section.spaceId === null;
  const isBusySpace = !isRoot && joiningRooms.has(section.spaceId!);
  const graph = useSpaceGraph();
  const rooms = useAllRooms();
  const sectionJoined = !isRoot && graph.some((s) => s.spaceId === section.spaceId);
  const spaceForSection = useRoomDetails(sectionJoined ? section.spaceId : null);
  const memberCount = section.memberCount ?? spaceForSection?.memberCount ?? 0;

  // Per-section lazy fetch: fires when first opened, then refreshes live as the
  const [localRooms, setLocalRooms] = useState<SpaceRoomEntry[]>(section.rooms);
  const [isFetching, setIsFetching] = useState(false);
  const fetchedRef = useRef(section.roomsLoaded);
  const cachedRoomsRef = useRef<SpaceRoomEntry[]>(section.rooms);

  const queryClient = useQueryClient();
  const fetchRooms = useCallback(
    (force = false) => {
      if (isRoot || !client || !section.spaceId) return;
      const subSpaceId = section.spaceId;
      const apply = (summaryMap: Map<string, RoomSummary>) => {
        const { rooms, subSpaces } = splitHierarchyLevel(subSpaceId, summaryMap, client, 'Unknown');
        cachedRoomsRef.current = rooms;
        setLocalRooms(rooms);
        // Nested sub-spaces are promoted to their own sections so they are
        // never hidden by the parent's one-level fetch.
        if (subSpaces.length > 0) onSubSpacesFound(subSpaces);
      };

      const cached = getCachedSpaceHierarchy(queryClient, subSpaceId);
      if (cached) apply(cached);
      else if (cachedRoomsRef.current.length === 0) setIsFetching(true);

      loadSpaceHierarchy(queryClient, client, subSpaceId, { force })
        .then(apply)
        .catch(() => {})
        .finally(() => setIsFetching(false));
    },
    [isRoot, section.spaceId, client, onSubSpacesFound, queryClient]
  );

  const sectionChildren = useMemo(
    () => (isRoot || !section.spaceId ? [] : childrenOf(graph, section.spaceId)),
    [graph, isRoot, section.spaceId]
  );

  useEffect(() => {
    if (isRoot || !section.spaceId) return;
    const suggested = new Map(sectionChildren.map((c) => [c.roomId, c.suggested]));
    const updated = cachedRoomsRef.current.map((entry) => {
      const isSuggested = suggested.get(entry.roomId) === true;
      return entry.isSuggested === isSuggested ? entry : { ...entry, isSuggested };
    });
    const changed = updated.some((e, i) => e !== cachedRoomsRef.current[i]);
    if (changed) {
      cachedRoomsRef.current = updated;
      setLocalRooms(updated);
    }
  }, [isRoot, section.spaceId, sectionChildren]);

  useEffect(() => {
    if (!isOpen || isRoot || fetchedRef.current || !client || !section.spaceId) return;

    fetchedRef.current = true;
    fetchRooms();
  }, [isOpen, isRoot, client, section.spaceId, fetchRooms]);

  const refetchRooms = useCallback(() => fetchRooms(true), [fetchRooms]);
  const throttledFetchRooms = useThrottle(refetchRooms, 500);

  const childIdsKey = useMemo(
    () => sectionChildren.map((c) => c.roomId).join('|'),
    [sectionChildren]
  );
  const membershipKey = useMemo(
    () =>
      [...rooms.filter((r) => !r.isInvite).map((r) => r.id), ...graph.map((g) => g.spaceId)]
        .sort()
        .join('|'),
    [rooms, graph]
  );
  const lastKeysRef = useRef({ childIdsKey, membershipKey });

  useEffect(() => {
    const last = lastKeysRef.current;
    lastKeysRef.current = { childIdsKey, membershipKey };
    if (isRoot) return;
    if (last.childIdsKey === childIdsKey && last.membershipKey === membershipKey) return;
    throttledFetchRooms();
  }, [isRoot, childIdsKey, membershipKey, throttledFetchRooms]);

  const displayRooms = isRoot ? section.rooms : localRooms;

  const toast = useToast();
  const reorderSpaceId = section.spaceId ?? rootSpaceId;
  const canReorder = useCanSendState(reorderSpaceId)(SPACE_CHILD);
  const [pendingIds, setPendingIds] = useState<string[] | null>(null);
  const shownRooms = useMemo(() => {
    if (!pendingIds || pendingIds.length !== displayRooms.length) return displayRooms;
    const byId = new Map(displayRooms.map((r) => [r.roomId, r]));
    if (!pendingIds.every((id) => byId.has(id))) return displayRooms;
    return pendingIds.map((id) => byId.get(id)!);
  }, [displayRooms, pendingIds]);
  useEffect(() => {
    if (!pendingIds) return;
    if (displayRooms.map((r) => r.roomId).join('|') === pendingIds.join('|')) {
      setPendingIds(null);
      return;
    }
    const timer = setTimeout(() => setPendingIds(null), 8000);
    return () => clearTimeout(timer);
  }, [displayRooms, pendingIds]);
  const handleReorder = useCallback(
    (_section: string, orderedIds: string[], movedId: string) => {
      if (!client) return;
      const orders = new Map<string, string | undefined>(
        childrenOf(graph, reorderSpaceId).map((c) => [c.roomId, c.order ?? undefined])
      );
      setPendingIds(orderedIds);
      const updates = planSpaceReorder(orderedIds, orders, movedId);
      saveSpaceChildOrders(client, reorderSpaceId, updates).catch((err: unknown) => {
        setPendingIds(null);
        toast.error(t('room.reorderFailed', { error: getErrorMessage(err) }));
      });
    },
    [client, graph, reorderSpaceId, toast, t]
  );
  const reorderRows = useMemo(
    () =>
      shownRooms.map((r) => ({
        id: r.roomId,
        kind: 'room' as const,
        group: null,
        section: canReorder ? 'space' : null,
        label: r.name,
      })),
    [shownRooms, canReorder]
  );

  const handleHeaderClick = () => {
    onToggle(section.categoryKey);
  };

  return (
    <div className={css.spaceSection}>
      <div className={css.spaceSectionHeader} onClick={handleHeaderClick}>
        <button
          type="button"
          className={css.spaceSectionChevronButton}
          onClick={(e) => {
            e.stopPropagation();
            onToggle(section.categoryKey);
          }}
          aria-expanded={isOpen}
          aria-label={isRoot ? t('room.title') : section.spaceName}
        >
          <CaretDownIcon
            size={14}
            className={[css.spaceSectionChevron, !isOpen ? css.spaceSectionChevronClosed : '']
              .filter(Boolean)
              .join(' ')}
          />
        </button>
        {!isRoot && (
          <Avatar
            name={section.spaceName}
            mxcUrl={section.spaceAvatarMxc}
            client={client ?? undefined}
            size="sm"
          />
        )}
        <div className={css.spaceSectionTitle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0 }}>
            <span className={css.spaceSectionName}>
              {isRoot ? t('room.title') : section.spaceName}
            </span>
            {!isRoot && section.isSuggested && (
              <Tooltip content={t('room.suggested')}>
                <span className={css.suggestedBadge}>
                  <StarIcon size={14} weight="fill" />
                </span>
              </Tooltip>
            )}
          </div>
          {!isRoot && memberCount > 0 && (
            <span className={css.spaceSectionMeta}>
              <UsersIcon size={10} />
              {memberCount}
            </span>
          )}
        </div>
        <div className={css.spaceSectionActions} onClick={(e) => e.stopPropagation()}>
          {!isRoot && (
            <IconButton
              size="sm"
              tooltip={t('room.open')}
              aria-label={t('room.open')}
              onClick={() => onOpenSubSpace(section.spaceId!)}
            >
              <CaretDoubleRightIcon size={16} weight="bold" />
            </IconButton>
          )}
          {!isRoot && !section.isJoined && (
            <Button
              variant="secondary"
              size="sm"
              loading={isBusySpace}
              onClick={() => onJoinSpace(section.spaceId!, section.viaServers)}
            >
              {t('explore.join')}
            </Button>
          )}
          {canAddRoom && (isRoot || section.isJoined) && (
            <IconButton
              size="sm"
              tooltip={t('common.add')}
              aria-label={t('common.add')}
              onClick={(e) =>
                openContextMenu(e, buildAddMenu(section.spaceId ?? rootSpaceId, section.spaceName))
              }
            >
              <PlusIcon size={14} />
            </IconButton>
          )}
          {!isRoot && section.isJoined && (
            <IconButton
              size="sm"
              tooltip={t('common.more')}
              aria-label={t('common.more')}
              onClick={(e) => openContextMenu(e, buildSubSpaceMenu(section))}
            >
              <DotsThreeVerticalIcon size={16} weight="bold" />
            </IconButton>
          )}
        </div>
      </div>

      {isOpen && (
        <div className={css.spaceSectionRoomsNested}>
          {isFetching ? (
            <div className={css.spaceLoadingList}>
              <div className={css.skeletonSectionRow}>
                <div className={css.skeletonSectionChevron} />
                <div className={css.skeletonSectionInfo}>
                  <div className={css.skeletonSectionLine} />
                  <div className={css.skeletonSectionMeta} />
                </div>
                <div className={css.skeletonSectionBtn} />
              </div>
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className={css.skeletonRoomRow}>
                  <div className={css.skeletonRoomAvatar} />
                  <div className={css.skeletonRoomInfo}>
                    <div className={css.skeletonRoomName} />
                    <div className={css.skeletonRoomMeta} />
                  </div>
                  <div className={css.skeletonRoomBtn} />
                </div>
              ))}
            </div>
          ) : displayRooms.length === 0 ? (
            <div className={css.emptyState}>{t('room.noRooms')}</div>
          ) : (
            <RoomReorderProvider
              rows={reorderRows}
              onReorder={handleReorder}
              renderOverlay={(roomId) => {
                const entry = shownRooms.find((r) => r.roomId === roomId);
                if (!entry) return null;
                return (
                  <div className={css.spaceSectionRoomItem}>
                    <RoomRow
                      entry={entry}
                      parentSpaceId={section.spaceId ?? rootSpaceId}
                      joiningRooms={joiningRooms}
                      onSelect={noop}
                      onJoin={noop}
                      onKnock={noop}
                      buildRoomMenu={() => []}
                    />
                  </div>
                );
              }}
            >
              {shownRooms.map((entry) => (
                <SortableRoomRow key={entry.roomId} roomId={entry.roomId} disabled={!canReorder}>
                  <div className={css.spaceSectionRoomItem}>
                    <RoomRow
                      entry={entry}
                      parentSpaceId={section.spaceId ?? rootSpaceId}
                      joiningRooms={joiningRooms}
                      onSelect={onSelect}
                      onJoin={onJoin}
                      onKnock={onKnock}
                      buildRoomMenu={buildRoomMenu}
                    />
                  </div>
                </SortableRoomRow>
              ))}
            </RoomReorderProvider>
          )}
        </div>
      )}
    </div>
  );
}

export function SpaceOverview({ spaceId }: SpaceOverviewProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const client = getMatrixClientOrNull();
  const [joiningRooms, setJoiningRooms] = useState(() => new Set<string>());
  const toast = useToast();
  const { sections, isLoading, error, spaceSummary } = useSpaceRoomsGrouped(
    spaceId,
    t('common.unknown')
  );
  const [, setCurrentRoomId] = useAtom(currentRoomIdAtom);
  const setCreateRoomOpen = useSetAtom(createRoomOpenAtom);
  const setCreateSpaceOpen = useSetAtom(createSpaceOpenAtom);
  const setAddRoomToSpace = useSetAtom(addRoomToSpaceAtom);
  const [pinnedSubSpacesArr, setPinnedSubSpacesArr] = useAtom(pinnedSubSpacesAtom);
  const pinnedSubSpaces = useMemo(() => new Set(pinnedSubSpacesArr), [pinnedSubSpacesArr]);
  const setSpaceSettings = useSetAtom(spaceSettingsRoomIdAtom);
  const setRoomSettings = useSetAtom(roomSettingsRoomIdAtom);
  const roomActions = useRoomActions();
  const toggleMembersPanel = useSetAtom(spaceMembersPanelOpenAtom);
  const [openLobbyCategoriesArr, setOpenLobbyCategoriesArr] = useAtom(openLobbyCategoriesAtom);

  const openCategories = new Set(openLobbyCategoriesArr);

  const toggleCategory = useCallback(
    (categoryKey: string) => {
      setOpenLobbyCategoriesArr((prev) => {
        const next = new Set(prev);
        if (next.has(categoryKey)) {
          next.delete(categoryKey);
        } else {
          next.add(categoryKey);
        }
        return Array.from(next);
      });
    },
    [setOpenLobbyCategoriesArr]
  );

  const [nestedBySpace, setNestedBySpace] = useState<Record<string, SpaceSection[]>>({});
  const handleSubSpacesFound = useCallback(
    (found: SpaceSection[]) => {
      setNestedBySpace((prev) => {
        const foundIds = new Set(found.map((s) => s.spaceId));
        const kept = (prev[spaceId] ?? []).filter((s) => !s.spaceId || !foundIds.has(s.spaceId));
        return { ...prev, [spaceId]: [...kept, ...found] };
      });
    },
    [spaceId]
  );

  const nestedSections = useMemo(() => nestedBySpace[spaceId] ?? [], [nestedBySpace, spaceId]);

  const subspaceSections = useMemo(() => {
    const seen = new Set<string>();
    const out: SpaceSection[] = [];
    for (const s of [...sections, ...nestedSections]) {
      if (!s.spaceId || seen.has(s.spaceId)) continue;
      seen.add(s.spaceId);
      out.push(s);
    }
    return out;
  }, [sections, nestedSections]);

  const rootSection = sections.find((s) => s.spaceId === null);

  const queryClient = useQueryClient();
  const graph = useSpaceGraph();
  const joinedSpaces = useAllJoinedSpaces();
  const isJoined = graph.some((s) => s.spaceId === spaceId);
  const space = useRoomDetails(isJoined ? spaceId : null);
  const topLevel = joinedSpaces.find((s) => s.id === spaceId);
  const spaceName = space?.name ?? topLevel?.name ?? spaceId;
  const spaceAvatarMxc = space?.avatarUrl ?? topLevel?.avatarUrl ?? null;

  const spaceTopic = space?.topic ?? null;

  const selectRoom = useCallback(
    (roomId: string) => {
      setCurrentRoomId(roomId);
      navigate(`/r/${encodeURIComponent(roomId)}`);
    },
    [setCurrentRoomId, navigate]
  );

  const selectSpace = useCallback(
    (targetSpaceId: string) => {
      navigate(`/space/${encodeURIComponent(targetSpaceId)}`);
    },
    [navigate]
  );

  const handleAddRoom = useCallback(
    (targetSpaceId: string, targetSpaceName: string) => {
      setCreateRoomOpen({ open: true, spaceId: targetSpaceId, spaceName: targetSpaceName });
    },
    [setCreateRoomOpen]
  );

  const handleAddExistingRoom = useCallback(
    (targetSpaceId: string, targetSpaceName: string) => {
      setAddRoomToSpace({ open: true, spaceId: targetSpaceId, spaceName: targetSpaceName });
    },
    [setAddRoomToSpace]
  );

  const handleAddExistingSubSpace = useCallback(
    (targetSpaceId: string, targetSpaceName: string) => {
      setAddRoomToSpace({
        open: true,
        spaceId: targetSpaceId,
        spaceName: targetSpaceName,
        type: 'subspace',
      });
    },
    [setAddRoomToSpace]
  );

  const handleAddSubSpace = useCallback(
    (targetSpaceId: string, targetSpaceName: string) => {
      setCreateSpaceOpen({
        open: true,
        parentSpaceId: targetSpaceId,
        parentSpaceName: targetSpaceName,
      });
    },
    [setCreateSpaceOpen]
  );

  const buildAddMenu = useCallback(
    (targetSpaceId: string, targetSpaceName: string): ContextMenuItem[] => [
      {
        label: t('room.create.title'),
        icon: <HashStraightIcon size={14} />,
        onClick: () => handleAddRoom(targetSpaceId, targetSpaceName),
      },
      {
        label: t('room.space.addExistingRoom'),
        icon: <CubeIcon size={14} />,
        onClick: () => handleAddExistingRoom(targetSpaceId, targetSpaceName),
      },
      {
        divider: true,
        label: '',
        onClick: () => {},
      },
      {
        label: t('room.addSubSpace'),
        icon: <StackIcon size={14} />,
        onClick: () => handleAddSubSpace(targetSpaceId, targetSpaceName),
      },
      {
        label: t('room.space.addExistingSubSpace'),
        icon: <StackIcon size={14} />,
        onClick: () => handleAddExistingSubSpace(targetSpaceId, targetSpaceName),
      },
    ],
    [t, handleAddRoom, handleAddExistingRoom, handleAddSubSpace, handleAddExistingSubSpace]
  );

  const handleInvite = useCallback(() => {
    roomActions.inviteToRoom({ roomId: spaceId, name: spaceName, isSpace: true });
  }, [roomActions, spaceId, spaceName]);

  const handleSettings = useCallback(() => {
    setSpaceSettings(spaceId);
  }, [setSpaceSettings, spaceId]);

  const canSendSpaceState = useCanSendState(isJoined ? spaceId : null);
  const canRemoveFromSpace = canSendSpaceState(SPACE_CHILD);
  const canAddRoom = canSendSpaceState(SPACE_CHILD);

  const handleRemoveFromSpace = useCallback(
    async (childRoomId: string) => {
      if (!client) return;
      try {
        await client.removeFromSpace(spaceId, childRoomId);
        void queryClient.invalidateQueries({ queryKey: queryKeys.spaceChildren(spaceId) });
      } catch (err) {
        toast.error(t('room.space.removeFailed', { error: getErrorMessage(err) }));
      }
    },
    [client, spaceId, toast, t, queryClient]
  );

  const handleToggleSuggested = useCallback(
    async (childId: string, parentSpaceId: string) => {
      if (!client) return;
      const existing = childrenOf(graph, parentSpaceId).find((c) => c.roomId === childId);
      if (!existing) return;
      try {
        await client.updateSpaceChild(parentSpaceId, childId, !existing.suggested, null, false);
        void queryClient.invalidateQueries({ queryKey: queryKeys.spaceChildren(parentSpaceId) });
      } catch (err) {
        toast.error(t('common.error', { error: getErrorMessage(err) }));
      }
    },
    [client, graph, toast, t, queryClient]
  );

  const buildRoomMenu = useCallback(
    (entry: SpaceRoomEntry, fromSpaceId: string): ContextMenuItem[] => {
      const items: ContextMenuItem[] = [
        {
          label: t('common.invite'),
          icon: <UserPlusIcon size={14} />,
          onClick: () =>
            roomActions.inviteToRoom({
              roomId: entry.roomId,
              name: entry.name,
              isSpace: false,
            }),
        },
        {
          label: t('common.settings'),
          icon: <GearIcon size={14} />,
          onClick: () => setRoomSettings(entry.roomId),
        },
      ];
      if (canRemoveFromSpace) {
        items.push({
          label: entry.isSuggested ? t('room.space.unsetSuggested') : t('room.space.setSuggested'),
          icon: <StarIcon size={14} weight={entry.isSuggested ? 'fill' : 'regular'} />,
          onClick: () => handleToggleSuggested(entry.roomId, fromSpaceId),
        });
      }
      items.push({ divider: true, label: '', onClick: () => {} });
      if (canRemoveFromSpace) {
        items.push({
          label: t('room.space.removeRoom'),
          icon: <XIcon size={14} />,
          danger: true,
          onClick: () => handleRemoveFromSpace(entry.roomId),
        });
      }
      items.push({
        label: t('room.leaveRoom'),
        icon: <SignOutIcon size={14} />,
        danger: true,
        onClick: () => roomActions.leaveRoom(entry.roomId, entry.name),
      });
      return items;
    },
    [
      t,
      roomActions,
      setRoomSettings,
      canRemoveFromSpace,
      handleRemoveFromSpace,
      handleToggleSuggested,
    ]
  );

  const buildSubSpaceMenu = useCallback(
    (section: SpaceSection): ContextMenuItem[] => {
      const isPinned = pinnedSubSpaces.has(section.spaceId!);
      const items: ContextMenuItem[] = [
        {
          label: isPinned ? t('room.space.unpinFromSidebar') : t('room.space.pinToSidebar'),
          icon: <PushPinIcon size={14} weight={isPinned ? 'fill' : 'regular'} />,
          onClick: () => {
            setPinnedSubSpacesArr((prev) => {
              const next = new Set(prev);
              if (isPinned) {
                next.delete(section.spaceId!);
              } else {
                next.add(section.spaceId!);
              }
              return Array.from(next);
            });
          },
        },
        {
          label: t('common.invite'),
          icon: <UserPlusIcon size={14} />,
          onClick: () =>
            roomActions.inviteToRoom({
              roomId: section.spaceId!,
              name: section.spaceName,
              isSpace: true,
            }),
        },
        {
          label: t('common.settings'),
          icon: <GearIcon size={14} />,
          onClick: () => setSpaceSettings(section.spaceId!),
        },
      ];
      if (canRemoveFromSpace) {
        items.push({
          label: section.isSuggested
            ? t('room.space.unsetSuggested')
            : t('room.space.setSuggested'),
          icon: <StarIcon size={14} weight={section.isSuggested ? 'fill' : 'regular'} />,
          onClick: () => handleToggleSuggested(section.spaceId!, spaceId),
        });
      }
      items.push({ divider: true, label: '', onClick: () => {} });
      if (canRemoveFromSpace) {
        items.push({
          label: t('room.space.removeRoom'),
          icon: <XIcon size={14} />,
          danger: true,
          onClick: () => handleRemoveFromSpace(section.spaceId!),
        });
      }
      items.push({
        label: t('room.space.leave'),
        icon: <SignOutIcon size={14} />,
        danger: true,
        onClick: () => roomActions.leaveSpace(section.spaceId!, section.spaceName),
      });
      return items;
    },
    [
      t,
      roomActions,
      setSpaceSettings,
      canRemoveFromSpace,
      handleRemoveFromSpace,
      handleToggleSuggested,
      pinnedSubSpaces,
      setPinnedSubSpacesArr,
      spaceId,
    ]
  );

  const handleJoinRoom = useCallback(
    async (roomId: string, _name: string, viaServers: string[]) => {
      if (!client) return;
      setJoiningRooms((prev) => new Set(prev).add(roomId));
      try {
        await joinVia(client, roomId, viaServers);
      } catch (err) {
        toast.error(t('explore.joinFailed', { error: getErrorMessage(err) }));
      } finally {
        setJoiningRooms((prev) => {
          const next = new Set(prev);
          next.delete(roomId);
          return next;
        });
      }
    },
    [client, toast, t]
  );

  const handleKnockRoom = useCallback(
    async (roomId: string, viaServers: string[]) => {
      if (!client) return;
      setJoiningRooms((prev) => new Set(prev).add(roomId));
      try {
        await client.knock(roomId, null, viaServers);
      } catch (err) {
        toast.error(t('explore.knockFailed', { error: getErrorMessage(err) }));
      } finally {
        setJoiningRooms((prev) => {
          const next = new Set(prev);
          next.delete(roomId);
          return next;
        });
      }
    },
    [client, toast, t]
  );

  const handleJoinSpace = useCallback(
    async (subSpaceId: string, viaServers: string[]) => {
      if (!client) return;
      setJoiningRooms((prev) => new Set(prev).add(subSpaceId));
      try {
        await joinVia(client, subSpaceId, viaServers);
      } catch (err) {
        toast.error(t('explore.joinFailed', { error: getErrorMessage(err) }));
      } finally {
        setJoiningRooms((prev) => {
          const next = new Set(prev);
          next.delete(subSpaceId);
          return next;
        });
      }
    },
    [client, toast, t]
  );

  if (!isJoined) {
    // Space not joined locally (not a member, or only invited). Skeleton only
    // while the hierarchy query is still running; afterwards show a preview +
    // join prompt.
    if (isLoading) {
      return (
        <div className={css.container}>
          <div className={css.pageScroll}>
            <div className={css.pageContent}>
              <div className={css.skeletonHeader}>
                <div className={css.skeletonAvatarCircle} />
                <div className={css.skeletonLineWide} />
                <div className={css.skeletonLineShort} />
                <div className={css.skeletonActions}>
                  <div className={css.skeletonButton} />
                  <div className={css.skeletonButton} />
                </div>
              </div>
              <div className={css.spaceLoadingList}>
                <div className={css.skeletonSectionRow}>
                  <div className={css.skeletonSectionChevron} />
                  <div className={css.skeletonSectionInfo}>
                    <div className={css.skeletonSectionLine} />
                    <div className={css.skeletonSectionMeta} />
                  </div>
                  <div className={css.skeletonSectionBtn} />
                </div>
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className={css.skeletonRoomRow}>
                    <div className={css.skeletonRoomAvatar} />
                    <div className={css.skeletonRoomInfo}>
                      <div className={css.skeletonRoomName} />
                      <div className={css.skeletonRoomMeta} />
                    </div>
                    <div className={css.skeletonRoomBtn} />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      );
    }

    if (!spaceSummary) {
      return (
        <div className={css.container}>
          <div className={css.pageScroll}>
            <div className={css.pageContent}>
              <div className={css.noPreviewScreen}>
                <div className={css.noPreviewText}>{t('room.space.noPreview')}</div>
                <Button
                  variant="primary"
                  loading={joiningRooms.has(spaceId)}
                  onClick={() => handleJoinSpace(spaceId, [])}
                >
                  {t('explore.join')}
                </Button>
              </div>
            </div>
          </div>
        </div>
      );
    }
  }

  return (
    <div className={css.container}>
      <div className={css.pageScroll}>
        <div className={css.pageContent}>
          <div className={css.spaceHeader}>
            {isJoined ? (
              <>
                <Avatar
                  name={spaceName}
                  mxcUrl={spaceAvatarMxc}
                  client={client ?? undefined}
                  size="xl"
                />
                <div className={css.spaceInfo}>
                  <h2 className={css.spaceName}>{spaceName}</h2>
                  {typeof rootSection?.memberCount === 'number' && rootSection.memberCount > 0 && (
                    <div className={css.spaceMeta}>
                      {rootSection.memberCount.toLocaleString()} {t('common.members').toLowerCase()}
                    </div>
                  )}
                  {spaceTopic && <div className={css.spaceTopic}>{spaceTopic}</div>}
                </div>
                <div className={css.spaceActions}>
                  <Button variant="secondary" size="sm" onClick={handleInvite}>
                    <UserPlusIcon size={14} />
                    {t('common.invite')}
                  </Button>
                  <Button variant="secondary" size="sm" onClick={handleSettings}>
                    <GearIcon size={14} />
                    {t('common.settings')}
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => toggleMembersPanel((v) => !v)}
                  >
                    <UsersIcon size={14} />
                    {t('common.members')}
                  </Button>
                </div>
              </>
            ) : spaceSummary ? (
              <>
                <Avatar
                  name={spaceSummary.name ?? spaceId}
                  mxcUrl={spaceSummary.avatar_url ?? null}
                  client={client ?? undefined}
                  size="xl"
                />
                <div className={css.spaceInfo}>
                  <h2 className={css.spaceName}>{spaceSummary.name ?? spaceId}</h2>
                  {spaceSummary.num_joined_members > 0 && (
                    <div className={css.spaceMeta}>
                      {spaceSummary.num_joined_members.toLocaleString()}{' '}
                      {t('common.members').toLowerCase()}
                    </div>
                  )}
                  {spaceSummary.topic != null && spaceSummary.topic !== '' && (
                    <div className={css.spaceTopic}>{spaceSummary.topic}</div>
                  )}
                </div>
                <div className={css.spaceActions}>
                  <Button
                    variant="primary"
                    loading={joiningRooms.has(spaceId)}
                    onClick={() => handleJoinSpace(spaceId, spaceSummary.via ?? [])}
                  >
                    {t('explore.join')}
                  </Button>
                </div>
              </>
            ) : null}
          </div>
          {error && (
            <div className={css.errorBanner} role="alert">
              {t('room.space.loadFailed', { error: getErrorMessage(error) })}
            </div>
          )}
          {isLoading && (
            <div className={css.spaceLoadingList}>
              <div className={css.skeletonSectionRow}>
                <div className={css.skeletonSectionChevron} />
                <div className={css.skeletonSectionInfo}>
                  <div className={css.skeletonSectionLine} />
                  <div className={css.skeletonSectionMeta} />
                </div>
                <div className={css.skeletonSectionBtn} />
              </div>
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className={css.skeletonRoomRow}>
                  <div className={css.skeletonRoomAvatar} />
                  <div className={css.skeletonRoomInfo}>
                    <div className={css.skeletonRoomName} />
                    <div className={css.skeletonRoomMeta} />
                  </div>
                  <div className={css.skeletonRoomBtn} />
                </div>
              ))}
            </div>
          )}
          {!isLoading && (
            <div className={css.sectionList}>
              {rootSection && !(rootSection.rooms.length === 0 && subspaceSections.length > 0) && (
                <SpaceSectionView
                  key={rootSection.categoryKey}
                  section={rootSection}
                  rootSpaceId={spaceId}
                  isOpen={openCategories.has(rootSection.categoryKey)}
                  onToggle={toggleCategory}
                  canAddRoom={canAddRoom}
                  joiningRooms={joiningRooms}
                  buildSubSpaceMenu={buildSubSpaceMenu}
                  buildAddMenu={buildAddMenu}
                  onSelect={selectRoom}
                  onJoin={handleJoinRoom}
                  onKnock={handleKnockRoom}
                  onJoinSpace={handleJoinSpace}
                  buildRoomMenu={buildRoomMenu}
                  onOpenSubSpace={selectSpace}
                  onSubSpacesFound={handleSubSpacesFound}
                />
              )}

              {subspaceSections.map((section) => (
                <SpaceSectionView
                  key={section.categoryKey}
                  section={section}
                  rootSpaceId={spaceId}
                  isOpen={openCategories.has(section.categoryKey)}
                  onToggle={toggleCategory}
                  canAddRoom={canAddRoom}
                  joiningRooms={joiningRooms}
                  buildSubSpaceMenu={buildSubSpaceMenu}
                  buildAddMenu={buildAddMenu}
                  onSelect={selectRoom}
                  onJoin={handleJoinRoom}
                  onKnock={handleKnockRoom}
                  onJoinSpace={handleJoinSpace}
                  buildRoomMenu={buildRoomMenu}
                  onOpenSubSpace={selectSpace}
                  onSubSpacesFound={handleSubSpacesFound}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
