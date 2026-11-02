import { useState, useMemo, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useAtom, useSetAtom } from 'jotai';
import { useQueryClient } from '@tanstack/react-query';
import {
  ArrowCounterClockwiseIcon,
  MagnifyingGlassIcon,
  FunnelSimpleIcon,
  ArrowsDownUpIcon,
} from '@phosphor-icons/react';
import {
  powerLevelOf,
  queryKeys,
  useClient,
  useRoomDetails,
  useRoomSettings,
  useUserId,
} from '@/app/data';
import { Avatar } from '@/app/components/Avatar';
import { Input } from '@/app/components/Input';
import { Select } from '@/app/components/Select';
import { IconButton } from '@/app/components/Button';
import { useToast } from '@/app/hooks/useToast';
import { useMembers, useKnockRequests, useBannedMembers } from '@/app/features/room/useMembers';
import type { MemberEntry } from '@/app/features/room/useMembers';
import {
  getRoleKey,
  getRoleLabel,
  getRoleRank,
  getRoomCreators,
} from '@/app/features/room/memberRoles';
import { membersPanelStateAtom, userProfileAtom } from '@/app/store/atoms';
import { useConfirm } from '@/app/hooks/useConfirm';
import { getErrorMessage } from '@/util/error';
import * as css from '@/app/components/Settings/Settings.css';

interface PermissionsPanelProps {
  roomId: string;
}

const INITIAL_VISIBLE = 10;

export function PermissionsPanel({ roomId }: PermissionsPanelProps) {
  const { t } = useTranslation();
  const client = useClient();
  const queryClient = useQueryClient();
  const toast = useToast();
  const confirmDialog = useConfirm();
  const setProfile = useSetAtom(userProfileAtom);
  const myUserId = useUserId();
  const { members: allMembers } = useMembers(client, roomId);
  const { knockRequests } = useKnockRequests(client, roomId);
  const { bannedMembers } = useBannedMembers(client, roomId);
  const { data: settings } = useRoomSettings(roomId);
  const details = useRoomDetails(roomId);
  const myLevel = settings ? powerLevelOf(settings.powerLevels, myUserId, settings.creators) : 0;
  const canModerate = myLevel >= 50;
  const plContent = settings?.powerLevels ?? {};
  const banThreshold: number = plContent.ban ?? 50;
  const canUnban = (m: MemberEntry) => myLevel >= banThreshold && myLevel > m.powerLevel;
  const memberCount = details?.memberCount ?? 0;

  const [query, setQuery] = useState('');
  const [{ sort }, setMembersPanelState] = useAtom(membersPanelStateAtom);
  const [roleFilter, setRoleFilter] = useState('all');
  const [expanded, setExpanded] = useState(() => new Set<string>());
  const [bannedExpanded, setBannedExpanded] = useState(false);
  const [pendingExpanded, setPendingExpanded] = useState(false);

  const creators = useMemo(() => getRoomCreators(settings), [settings]);

  // Roles that actually exist in this room, ordered by privilege.
  const roleOptions = useMemo(() => {
    const seen = new Set<string>();
    for (const m of allMembers) seen.add(getRoleKey(m, creators));
    return [...seen]
      .sort((a, b) => getRoleRank(b) - getRoleRank(a))
      .map((roleKey) => ({ value: roleKey, label: getRoleLabel(roleKey, t) }));
  }, [allMembers, creators, t]);

  const filterOptions = useMemo(
    () => [{ value: 'all', label: t('room.members.allRoles') }, ...roleOptions],
    [roleOptions, t]
  );

  const activeRoleFilter =
    roleFilter === 'all' || roleOptions.some((option) => option.value === roleFilter)
      ? roleFilter
      : 'all';

  const sortOptions: { value: 'az' | 'za'; label: string }[] = [
    { value: 'az', label: t('room.members.sortAZ') },
    { value: 'za', label: t('room.members.sortZA') },
  ];

  const visibleMembers = useMemo(() => {
    const matched =
      activeRoleFilter === 'all'
        ? allMembers
        : allMembers.filter((m) => getRoleKey(m, creators) === activeRoleFilter);
    const byName =
      sort === 'za'
        ? (a: MemberEntry, b: MemberEntry) => b.displayName.localeCompare(a.displayName)
        : (a: MemberEntry, b: MemberEntry) => a.displayName.localeCompare(b.displayName);
    return [...matched].sort(byName);
  }, [allMembers, activeRoleFilter, creators, sort]);

  useEffect(() => {
    setRoleFilter('all');
  }, [roomId]);

  const handleUnbanMember = useCallback(
    async (member: MemberEntry) => {
      const confirmed = await confirmDialog({
        title: t('room.members.unbanConfirm', { name: member.displayName }),
        message: t('room.members.unbanConfirmMessage', { name: member.displayName }),
      });
      if (!confirmed) return;
      try {
        await client.unban(roomId, member.userId);
        void queryClient.invalidateQueries({ queryKey: queryKeys.membersIn(roomId, 'ban') });
      } catch (err) {
        toast.error(t('room.members.unbanFailed', { error: getErrorMessage(err) }));
      }
    },
    [client, queryClient, roomId, toast, t, confirmDialog]
  );

  const openProfile = useCallback(
    (member: MemberEntry, e: React.MouseEvent) => {
      const rect = e.currentTarget.getBoundingClientRect();
      setProfile({
        userId: member.userId,
        roomId,
        anchorRect: { top: rect.top, left: rect.left, width: rect.width, height: rect.height },
      });
    },
    [roomId, setProfile]
  );

  const grouped = useMemo(() => {
    const groups: { label: string; key: string; members: MemberEntry[] }[] = [
      { label: t('room.settings.members.admin'), key: 'admin', members: [] },
      { label: t('room.settings.members.moderator'), key: 'moderator', members: [] },
      { label: t('room.settings.members.member'), key: 'member', members: [] },
    ];

    for (const m of visibleMembers) {
      if (m.powerLevel >= 100) groups[0].members.push(m);
      else if (m.powerLevel >= 50) groups[1].members.push(m);
      else groups[2].members.push(m);
    }

    return groups;
  }, [visibleMembers, t]);

  const searchResults = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return null;
    return visibleMembers.filter(
      (m) => m.displayName.toLowerCase().includes(q) || m.userId.toLowerCase().includes(q)
    );
  }, [visibleMembers, query]);

  const toggleExpand = (key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const renderMemberRow = (m: MemberEntry) => (
    <div
      key={m.userId}
      className={css.permRow}
      onClick={(e) => openProfile(m, e)}
      style={{ cursor: 'pointer' }}
    >
      <Avatar
        name={m.displayName}
        mxcUrl={m.avatarMxc}
        client={client}
        size="sm"
        placeholder="logo"
      />
      <div className={css.permRowName}>
        <div>{m.displayName}</div>
        <div className={css.permRowId}>{m.userId}</div>
      </div>
    </div>
  );

  const renderPendingRow = (m: MemberEntry) => (
    <div
      key={m.userId}
      className={css.permRow}
      onClick={(e) => openProfile(m, e)}
      style={{ cursor: 'pointer' }}
    >
      <Avatar
        name={m.displayName}
        mxcUrl={m.avatarMxc}
        client={client}
        size="sm"
        placeholder="logo"
      />
      <div className={css.permRowName}>
        <div>{m.displayName}</div>
        <div className={css.permRowId}>{m.userId}</div>
      </div>
    </div>
  );

  const renderBannedRow = (m: MemberEntry) => (
    <div
      key={m.userId}
      className={css.permRow}
      onClick={(e) => openProfile(m, e)}
      style={{ cursor: 'pointer' }}
    >
      <Avatar
        name={m.displayName}
        mxcUrl={m.avatarMxc}
        client={client}
        size="sm"
        placeholder="logo"
      />
      <div className={css.permRowName}>
        <div>{m.displayName}</div>
        <div className={css.permRowId}>{m.userId}</div>
      </div>
      <IconButton
        size="xs"
        tooltip={t('room.members.unban')}
        aria-label={t('room.members.unban')}
        disabled={!canUnban(m)}
        onClick={(e) => {
          e.stopPropagation();
          handleUnbanMember(m);
        }}
      >
        <ArrowCounterClockwiseIcon size={14} />
      </IconButton>
    </div>
  );

  return (
    <div>
      <h2 className={css.panelTitle}>{t('room.settings.membersCount', { count: memberCount })}</h2>

      <div className={css.section}>
        <div className={css.permSearchRow}>
          <div className={css.permSearchWrap}>
            <Input
              label={t('room.settings.members.searchMembers')}
              placeholder={t('room.settings.members.searchMembersPlaceholder')}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              leadingIcon={<MagnifyingGlassIcon size={14} />}
            />
          </div>

          <Select
            icon={<FunnelSimpleIcon size={14} />}
            value={activeRoleFilter}
            options={filterOptions}
            aria-label={t('room.members.filterByRole')}
            onChange={(v) => setRoleFilter(v)}
          />

          <Select
            icon={<ArrowsDownUpIcon size={14} />}
            value={sort}
            options={sortOptions}
            aria-label={t('room.members.sortTitle')}
            onChange={(v) => setMembersPanelState((prev) => ({ ...prev, sort: v }))}
          />
        </div>

        {searchResults !== null ? (
          searchResults.length === 0 ? (
            <div className={css.noResults}>{t('room.settings.members.noMembersFound')}</div>
          ) : (
            <div className={css.permResults}>{searchResults.map(renderMemberRow)}</div>
          )
        ) : (
          grouped.map((group) => {
            if (group.members.length === 0) return null;
            const isExpanded = expanded.has(group.key);
            const showCount = isExpanded ? group.members.length : INITIAL_VISIBLE;
            const hidden = group.members.length - showCount;
            const visible = group.members.slice(0, showCount);

            return (
              <div key={group.key}>
                <div className={css.permGroupHeader}>
                  {group.label}
                  <span className={css.permGroupBadge}>{group.members.length}</span>
                </div>
                {visible.map(renderMemberRow)}
                {hidden > 0 && (
                  <button
                    type="button"
                    className={css.permShowMore}
                    onClick={() => toggleExpand(group.key)}
                  >
                    {t('room.settings.members.showMore', { count: hidden })}
                  </button>
                )}
              </div>
            );
          })
        )}
      </div>

      {canModerate && (
        <div className={css.section}>
          <div className={css.permGroupHeader}>
            {t('room.members.pending')}
            <span className={css.permGroupBadge}>{knockRequests.length}</span>
          </div>
          {knockRequests.length === 0 ? (
            <div className={css.noResults}>{t('room.members.noPendingRequests')}</div>
          ) : (
            <>
              {(pendingExpanded ? knockRequests : knockRequests.slice(0, INITIAL_VISIBLE)).map(
                renderPendingRow
              )}
              {knockRequests.length > INITIAL_VISIBLE && (
                <button
                  type="button"
                  className={css.permShowMore}
                  onClick={() => setPendingExpanded((e) => !e)}
                >
                  {pendingExpanded
                    ? t('room.settings.members.showLess')
                    : t('room.settings.members.showMore', {
                        count: knockRequests.length - INITIAL_VISIBLE,
                      })}
                </button>
              )}
            </>
          )}
        </div>
      )}

      {myLevel >= banThreshold && (
        <div className={css.section}>
          <div className={css.permGroupHeader}>
            {t('room.members.banned')}
            <span className={css.permGroupBadge}>{bannedMembers.length}</span>
          </div>
          {bannedMembers.length === 0 ? (
            <div className={css.noResults}>{t('room.members.noBannedMembers')}</div>
          ) : (
            <>
              {(bannedExpanded ? bannedMembers : bannedMembers.slice(0, INITIAL_VISIBLE)).map(
                renderBannedRow
              )}
              {bannedMembers.length > INITIAL_VISIBLE && (
                <button
                  type="button"
                  className={css.permShowMore}
                  onClick={() => setBannedExpanded((e) => !e)}
                >
                  {bannedExpanded
                    ? t('room.settings.members.showLess')
                    : t('room.settings.members.showMore', {
                        count: bannedMembers.length - INITIAL_VISIBLE,
                      })}
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
