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
import {
  useCanManageRoles,
  saveMemberRoles,
  useSpaceMemberRoles,
} from '@/app/features/space/spaceRoles';
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
  const powerEventLevel: number =
    plContent.events?.['m.room.power_levels'] ?? plContent.state_default ?? 50;
  const canAssignRoles = myLevel >= powerEventLevel;
  const myCreators = getRoomCreators(settings);
  const roleChoices = [
    { value: '100', label: t('room.members.admin') },
    { value: '50', label: t('room.members.moderator') },
    { value: '0', label: t('room.members.member') },
  ].filter((o) => Number(o.value) <= myLevel);

  const handleAssignRole = async (m: MemberEntry, next: string) => {
    const label = roleChoices.find((o) => o.value === next)?.label ?? next;
    // Someone raised to your own level can no longer be lowered by you: ask first.
    if (Number(next) >= myLevel && Number(next) > m.powerLevel) {
      const confirmed = await confirmDialog({
        title: t('room.settings.members.promoteToOwnLevelTitle', {
          name: m.displayName,
          level: label,
        }),
        message: t('room.settings.members.promoteToOwnLevelMessage', { name: m.displayName }),
        confirmLabel: t('room.settings.members.promoteToOwnLevelConfirm'),
        danger: true,
      });
      if (!confirmed) return;
    }
    try {
      await client.setPowerLevel(roomId, m.userId, Number(next));
      toast.success(
        t('room.settings.members.permissionsApplySuccess', { name: m.displayName, level: label })
      );
    } catch (err) {
      toast.error(
        t('room.settings.members.permissionsApplyFailed', { error: getErrorMessage(err) })
      );
    }
  };

  /** The role beside a member: a dropdown when you may change it, plain text otherwise. */
  const renderRole = (m: MemberEntry) => {
    const key = getRoleKey(m, myCreators);
    const label = getRoleLabel(key, t);
    const editable =
      canAssignRoles &&
      m.userId !== myUserId &&
      !myCreators.has(m.userId) &&
      m.powerLevel < myLevel;
    if (!editable) return <span className={css.permRowRole}>{label}</span>;
    const options = roleChoices.some((o) => o.value === String(m.powerLevel))
      ? roleChoices
      : [...roleChoices, { value: String(m.powerLevel), label }];
    return (
      <div onClick={(e) => e.stopPropagation()}>
        <Select
          surface="pill"
          value={String(m.powerLevel)}
          options={options}
          aria-label={t('room.members.role')}
          onChange={(next) => handleAssignRole(m, next)}
        />
      </div>
    );
  };
  const memberCount = details?.memberCount ?? 0;

  // Cosmetic space roles: shown beside each person, handed out by those who may.
  const isSpace = settings?.isSpace ?? false;
  const spaceRoles = useSpaceMemberRoles(isSpace ? roomId : null);
  const canHandOutRoles = useCanManageRoles(isSpace ? roomId : null);
  const [rolesOpenFor, setRolesOpenFor] = useState<string | null>(null);
  const toggleMemberRole = async (userId: string, roleId: string) => {
    const held = new Set((spaceRoles.byUser.get(userId) ?? []).map((r) => r.id));
    if (held.has(roleId)) held.delete(roleId);
    else held.add(roleId);
    try {
      await saveMemberRoles(client, roomId, userId, [...held]);
    } catch (err) {
      toast.error(t('room.settings.roles.saveFailed', { error: getErrorMessage(err) }));
    }
  };

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
    <div key={m.userId}>
      <div className={css.permRow} onClick={(e) => openProfile(m, e)} style={{ cursor: 'pointer' }}>
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
        {(spaceRoles.byUser.get(m.userId) ?? []).map((r) => (
          <span key={r.id} className={css.permRowRole} style={{ color: r.color, marginLeft: 0 }}>
            {r.name}
          </span>
        ))}
        {canHandOutRoles && spaceRoles.roles.length > 0 && (
          <button
            type="button"
            className={css.permRowRole}
            aria-label={t('room.settings.roles.assign')}
            aria-expanded={rolesOpenFor === m.userId}
            onClick={(e) => {
              e.stopPropagation();
              setRolesOpenFor(rolesOpenFor === m.userId ? null : m.userId);
            }}
          >
            +
          </button>
        )}
        {renderRole(m)}
      </div>
      {canHandOutRoles && rolesOpenFor === m.userId && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: '0 10px 8px 48px' }}>
          {spaceRoles.roles.map((r) => {
            const on = (spaceRoles.byUser.get(m.userId) ?? []).some((h) => h.id === r.id);
            return (
              <button
                key={r.id}
                type="button"
                aria-pressed={on}
                onClick={() => toggleMemberRole(m.userId, r.id)}
                style={{
                  color: r.color,
                  border: `1px solid ${r.color ?? 'currentColor'}`,
                  borderRadius: 999,
                  padding: '2px 10px',
                  fontSize: '0.78rem',
                  opacity: on ? 1 : 0.45,
                  background: on ? 'rgba(127,127,127,0.18)' : 'none',
                }}
              >
                {r.name}
              </button>
            );
          })}
        </div>
      )}
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
