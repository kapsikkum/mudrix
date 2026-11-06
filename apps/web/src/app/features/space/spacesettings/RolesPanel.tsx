import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ArrowCounterClockwiseIcon,
  ArrowDownIcon,
  ArrowUpIcon,
  PlusIcon,
  TrashIcon,
} from '@phosphor-icons/react';
import { useClient, useRoomSettings } from '@/app/data';
import { Button, IconButton } from '@/app/components/Button';
import { Toggle } from '@/app/components/Toggle';
import { useConfirm } from '@/app/hooks/useConfirm';
import { useToast } from '@/app/hooks/useToast';
import { useMembers } from '@/app/features/room/useMembers';
import { getErrorMessage } from '@/util/error';
import * as css from '@/app/components/Settings/Settings.css';
import {
  BUILTIN_ROLE_KEYS,
  MAX_ROLES,
  MAX_ROLE_NAME,
  RoleCleanupError,
  builtinKeyOf,
  cleanRoleName,
  deleteSpaceRole,
  newRoleId,
  saveSpaceRoles,
  useCanManageRoles,
  useSpaceMemberRoles,
  type BuiltinRoleKey,
  type BuiltinRoleLooks,
  type SpaceRole,
} from '../spaceRoles';

const DEFAULT_COLOR = '#5865f2';
const NEUTRAL_COLOR = '#99aab5';

const BUILTIN_LABEL_KEYS: Record<BuiltinRoleKey, string> = {
  founder: 'room.members.founder',
  '100': 'room.members.admin',
  '50': 'room.members.moderator',
  '0': 'room.members.member',
};

const swatchStyle = { width: 28, height: 28, padding: 0, border: 'none', background: 'none' };
const nameStyle = { background: 'none', border: 'none', outline: 'none' };

/**
 * The space's roles. The roles Matrix already has (Founder, Admin, Moderator, Member) are listed
 * first: they cannot be removed, but can be renamed and given a colour. Your own roles follow.
 */
export function RolesPanel({ spaceId }: { spaceId: string }) {
  const { t } = useTranslation();
  const client = useClient();
  const toast = useToast();
  const confirmDialog = useConfirm();
  const current = useSpaceMemberRoles(spaceId);
  const { roles: saved, builtin: savedBuiltin, byUser } = current;
  const editable = useCanManageRoles(spaceId);
  const { members } = useMembers(client, spaceId);
  const { data: settings } = useRoomSettings(spaceId);

  const [draft, setDraft] = useState<SpaceRole[]>(saved);
  const [draftBuiltin, setDraftBuiltin] = useState<BuiltinRoleLooks>(savedBuiltin);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  // Follow changes made elsewhere until there is something unsaved here.
  useEffect(() => {
    if (dirty) return;
    setDraft(saved);
    setDraftBuiltin(savedBuiltin);
  }, [saved, savedBuiltin, dirty]);

  const builtinCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const m of members) {
      const key = builtinKeyOf(settings, m.userId, m.powerLevel);
      counts[key] = (counts[key] ?? 0) + 1;
    }
    return counts;
  }, [settings, members]);

  const change = (next: SpaceRole[]) => {
    setDraft(next);
    setDirty(true);
  };
  const patch = (id: string, part: Partial<SpaceRole>) =>
    change(draft.map((role) => (role.id === id ? { ...role, ...part } : role)));
  const patchBuiltin = (key: BuiltinRoleKey, part: { name?: string; color?: string } | null) => {
    setDraftBuiltin((cur) => {
      const next = { ...cur };
      const merged = part === null ? {} : { ...cur[key], ...part };
      if (!merged.name) delete merged.name;
      if (merged.name === undefined && merged.color === undefined) delete next[key];
      else next[key] = merged;
      return next;
    });
    setDirty(true);
  };
  const move = (index: number, by: -1 | 1) => {
    const to = index + by;
    if (to < 0 || to >= draft.length) return;
    const next = [...draft];
    [next[index], next[to]] = [next[to], next[index]];
    change(next);
  };

  const add = () => {
    if (draft.length >= MAX_ROLES) return;
    change([
      ...draft,
      { id: newRoleId(), name: t('room.settings.roles.newRole'), color: DEFAULT_COLOR },
    ]);
  };

  const remove = async (role: SpaceRole) => {
    const existing = saved.some((r) => r.id === role.id);
    if (!existing) {
      change(draft.filter((r) => r.id !== role.id));
      return;
    }
    const confirmed = await confirmDialog({
      title: t('room.settings.roles.deleteTitle', { name: role.name }),
      message: t('room.settings.roles.deleteMessage'),
    });
    if (!confirmed) return;
    try {
      await deleteSpaceRole(client, spaceId, current, role.id);
      setDraft((cur) => cur.filter((r) => r.id !== role.id));
    } catch (err) {
      if (err instanceof RoleCleanupError) {
        // The role itself is gone; only some people's leftover assignments are (harmlessly) stale.
        setDraft((cur) => cur.filter((r) => r.id !== role.id));
        toast.error(
          t('room.settings.roles.deletePartial', {
            failed: err.failed.length,
            total: err.total,
            error: getErrorMessage(err.firstError),
          })
        );
        return;
      }
      toast.error(t('room.settings.roles.saveFailed', { error: getErrorMessage(err) }));
    }
  };

  const save = async () => {
    const clean = draft
      .map((role) => ({ ...role, name: cleanRoleName(role.name) }))
      .filter((role) => role.name);
    const looks: BuiltinRoleLooks = {};
    for (const key of BUILTIN_ROLE_KEYS) {
      const look = draftBuiltin[key];
      const name = cleanRoleName(look?.name);
      if (look && (name || look.color)) {
        looks[key] = { ...(name ? { name } : {}), ...(look.color ? { color: look.color } : {}) };
      }
    }
    setSaving(true);
    try {
      await saveSpaceRoles(client, spaceId, clean, looks);
      setDraft(clean);
      setDraftBuiltin(looks);
      setDirty(false);
      toast.success(t('room.settings.roles.saved'));
    } catch (err) {
      toast.error(t('room.settings.roles.saveFailed', { error: getErrorMessage(err) }));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <h2 className={css.panelTitle}>{t('room.settings.roles.title')}</h2>
      <div className={css.section}>
        <p className={css.noResults} style={{ textAlign: 'left' }}>
          {t('room.settings.roles.note')}
        </p>

        {BUILTIN_ROLE_KEYS.map((key) => {
          const look = draftBuiltin[key];
          return (
            <div key={key} className={css.permRow} data-testid={`builtin-role-${key}`}>
              <input
                type="color"
                aria-label={t('room.settings.roles.color')}
                value={look?.color ?? NEUTRAL_COLOR}
                disabled={!editable}
                onChange={(e) => patchBuiltin(key, { color: e.target.value })}
                style={swatchStyle}
              />
              <input
                type="text"
                aria-label={t('room.settings.roles.name')}
                value={look?.name ?? ''}
                placeholder={t(BUILTIN_LABEL_KEYS[key])}
                maxLength={MAX_ROLE_NAME}
                disabled={!editable}
                onChange={(e) => patchBuiltin(key, { name: e.target.value })}
                className={css.permRowName}
                style={{ ...nameStyle, color: look?.color }}
              />
              <span className={css.permRowRole}>
                {t('room.settings.roles.memberCount', { count: builtinCounts[key] ?? 0 })}
              </span>
              <IconButton
                size="xs"
                aria-label={t('room.settings.roles.reset')}
                disabled={!editable || !look}
                onClick={() => patchBuiltin(key, null)}
              >
                <ArrowCounterClockwiseIcon size={14} />
              </IconButton>
            </div>
          );
        })}

        {draft.map((role, index) => (
          <div key={role.id} className={css.permRow} data-testid="role-row">
            <input
              type="color"
              aria-label={t('room.settings.roles.color')}
              value={role.color ?? DEFAULT_COLOR}
              disabled={!editable}
              onChange={(e) => patch(role.id, { color: e.target.value })}
              style={swatchStyle}
            />
            <input
              type="text"
              aria-label={t('room.settings.roles.name')}
              value={role.name}
              maxLength={MAX_ROLE_NAME}
              disabled={!editable}
              onChange={(e) => patch(role.id, { name: e.target.value })}
              className={css.permRowName}
              style={{ ...nameStyle, color: role.color }}
            />
            <span className={css.permRowRole}>
              {t('room.settings.roles.memberCount', {
                count: [...byUser.values()].filter((held) => held.some((r) => r.id === role.id))
                  .length,
              })}
            </span>
            <span className={css.permRowRole}>{t('room.settings.roles.separate')}</span>
            <Toggle
              size="sm"
              checked={role.hoist === true}
              disabled={!editable}
              ariaLabel={t('room.settings.roles.separate')}
              onChange={(on) => patch(role.id, { hoist: on || undefined })}
            />
            <IconButton
              size="xs"
              aria-label={t('room.settings.roles.moveUp')}
              disabled={!editable || index === 0}
              onClick={() => move(index, -1)}
            >
              <ArrowUpIcon size={14} />
            </IconButton>
            <IconButton
              size="xs"
              aria-label={t('room.settings.roles.moveDown')}
              disabled={!editable || index === draft.length - 1}
              onClick={() => move(index, 1)}
            >
              <ArrowDownIcon size={14} />
            </IconButton>
            <IconButton
              size="xs"
              danger
              aria-label={t('room.settings.roles.delete')}
              disabled={!editable}
              onClick={() => remove(role)}
            >
              <TrashIcon size={14} />
            </IconButton>
          </div>
        ))}

        {editable ? (
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <Button variant="secondary" onClick={add} disabled={draft.length >= MAX_ROLES}>
              <PlusIcon size={14} /> {t('room.settings.roles.add')}
            </Button>
            <Button onClick={save} disabled={!dirty || saving}>
              {t('common.save')}
            </Button>
          </div>
        ) : (
          <div className={css.noResults}>{t('room.settings.roles.readOnly')}</div>
        )}
      </div>
    </div>
  );
}
