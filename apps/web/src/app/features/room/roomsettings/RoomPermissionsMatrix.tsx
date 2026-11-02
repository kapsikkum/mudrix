import { Fragment, useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';

import {
  canSendState,
  powerLevelOf,
  refreshRoomSettings,
  useClient,
  useRoomSettings,
  useUserId,
} from '@/app/data';
import { useToast } from '@/app/hooks/useToast';
import { useConfirm } from '@/app/hooks/useConfirm';
import { useMembers } from '@/app/features/room/useMembers';
import { BASE_ROLE_LEVELS, getRoomCreators, getRoleLabel } from '@/app/features/room/memberRoles';
import { getErrorMessage } from '@/util/error';
import { Button } from '@/app/components/Button';
import * as settingsCss from '@/app/components/Settings/Settings.css';
import {
  type PermissionRow,
  type PowerLevelsContent,
  buildUpdatedContent,
  findOverLevelRows,
  getPermissionGroups,
  readEffectiveLevel,
} from './permissionMatrix';
import { Select } from '@/app/components/Select';
import * as css from './RoomPermissionsMatrix.css';

const CUSTOM = 'custom';

const EMPTY_CONTENT: PowerLevelsContent = {};

export const RoomPermissionsMatrix = ({ roomId }: { roomId: string }) => {
  const { t } = useTranslation();
  const toast = useToast();
  const confirmDialog = useConfirm();
  const client = useClient();
  const queryClient = useQueryClient();
  const myUserId = useUserId();
  const { data: settings } = useRoomSettings(roomId);

  const isSpace = settings?.isSpace ?? false;
  const groups = useMemo(() => getPermissionGroups(isSpace), [isSpace]);
  const rows = useMemo(() => groups.flatMap((g) => g.rows), [groups]);

  const content: PowerLevelsContent = useMemo(() => {
    const raw = settings?.powerLevels as PowerLevelsContent | undefined;
    return raw ?? EMPTY_CONTENT;
  }, [settings]);

  const { members } = useMembers(client, roomId);
  const creators = useMemo(() => getRoomCreators(settings), [settings]);
  const myLevel = settings ? powerLevelOf(settings.powerLevels, myUserId, settings.creators) : 0;
  const canEdit = canSendState(settings, myUserId, 'm.room.power_levels');

  const knownLevels = useMemo(() => {
    const levels = new Set<number>(BASE_ROLE_LEVELS);
    for (const member of members) {
      if (Number.isFinite(member.powerLevel) && member.powerLevel >= 0) {
        levels.add(member.powerLevel);
      }
    }
    for (const creator of creators) {
      const level = members.find((m) => m.userId === creator)?.powerLevel;
      if (level !== undefined && Number.isFinite(level) && level >= 0) levels.add(level);
    }
    return [...levels].sort((a, b) => b - a);
  }, [members, creators]);

  const levelLabel = useCallback((level: number) => getRoleLabel(String(level), t), [t]);

  const [edits, setEdits] = useState<Record<string, number>>({});
  const [customOpen, setCustomOpen] = useState<Record<string, boolean>>({});
  const [customText, setCustomText] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const discard = useCallback(() => {
    setEdits({});
    setCustomOpen({});
    setCustomText({});
  }, []);

  const currentValue = useCallback(
    (row: PermissionRow) => edits[row.id] ?? readEffectiveLevel(row, content),
    [edits, content]
  );

  const updates = useMemo(() => {
    const result: Record<string, number> = {};
    for (const row of rows) {
      const next = edits[row.id];
      if (next !== undefined && next !== readEffectiveLevel(row, content)) {
        result[row.id] = next;
      }
    }
    return result;
  }, [edits, rows, content]);

  const isDirty = Object.keys(updates).length > 0;
  const hasOverLevel = findOverLevelRows(rows, updates, myLevel).length > 0;
  const canSave = isDirty && !hasOverLevel;

  const onSelect = useCallback(
    (row: PermissionRow, raw: string) => {
      if (raw === CUSTOM) {
        setCustomOpen((prev) => ({ ...prev, [row.id]: true }));
        setCustomText((prev) => ({ ...prev, [row.id]: String(currentValue(row)) }));
        return;
      }
      setCustomOpen((prev) => ({ ...prev, [row.id]: false }));
      setEdits((prev) => ({ ...prev, [row.id]: Number(raw) }));
    },
    [currentValue]
  );

  const onCustomChange = useCallback((row: PermissionRow, text: string) => {
    setCustomText((prev) => ({ ...prev, [row.id]: text }));
    const parsed = Number(text);
    if (Number.isInteger(parsed) && parsed >= 0) {
      setEdits((prev) => ({ ...prev, [row.id]: parsed }));
    }
  }, []);

  const onSave = useCallback(async () => {
    if (findOverLevelRows(rows, updates, myLevel).length > 0) return;

    const confirmed = await confirmDialog({
      title: t('room.settings.permissions.confirmTitle'),
      message: t('room.settings.permissions.confirmMessage'),
      danger: true,
      confirmLabel: t('room.settings.permissions.confirmDanger'),
    });
    if (!confirmed) return;

    setSaving(true);
    try {
      await client.setPowerLevels(roomId, buildUpdatedContent(rows, content, updates));
      await refreshRoomSettings(queryClient, roomId);
      discard();
    } catch (err) {
      toast.error(t('room.settings.permissions.saveFailed', { error: getErrorMessage(err) }));
    } finally {
      setSaving(false);
    }
  }, [
    rows,
    updates,
    myLevel,
    content,
    client,
    queryClient,
    roomId,
    discard,
    t,
    toast,
    confirmDialog,
  ]);

  return (
    <div>
      <h2 className={settingsCss.panelTitle}>{t('room.settings.permissions.title')}</h2>

      {groups.map((group, index) => (
        <Fragment key={group.id}>
          {index > 0 && <div className={settingsCss.divider} />}

          <div className={settingsCss.section}>
            <h3 className={settingsCss.sectionTitle}>
              {t(`room.settings.permissions.groups.${group.id}`)}
            </h3>

            {group.rows.map((row) => {
              const value = currentValue(row);
              const isKnown = knownLevels.includes(value);
              const isCustom = customOpen[row.id] === true || !isKnown;
              const text = customText[row.id] ?? String(value);
              const invalid = isCustom && !(Number.isInteger(Number(text)) && Number(text) >= 0);
              const label = t(`room.settings.permissions.rows.${row.id}`);
              const disabled = !canEdit || saving;

              return (
                <div key={row.id} className={settingsCss.settingRow}>
                  <div className={settingsCss.settingInfo}>
                    <span className={settingsCss.settingLabel}>{label}</span>
                  </div>
                  <div className={css.levelControl}>
                    <Select
                      aria-label={label}
                      value={isCustom ? CUSTOM : String(value)}
                      disabled={disabled}
                      options={[
                        ...knownLevels.map((level) => ({
                          value: String(level),
                          label: levelLabel(level),
                        })),
                        { value: CUSTOM, label: t('room.settings.permissions.custom') },
                      ]}
                      onChange={(v) => onSelect(row, v)}
                    />

                    {isCustom && (
                      <input
                        type="number"
                        min={0}
                        step={1}
                        className={`${css.customInput}${invalid ? ` ${css.invalidInput}` : ''}`}
                        value={text}
                        disabled={disabled}
                        aria-label={`${label} — ${t('room.settings.permissions.level')}`}
                        onChange={(e) => onCustomChange(row, e.target.value)}
                      />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </Fragment>
      ))}

      {canEdit && (
        <div className={settingsCss.actions}>
          <Button
            variant="primary"
            loading={saving}
            spinnerWhileLoading
            disabled={!canSave}
            onClick={onSave}
          >
            {t('common.save')}
          </Button>
          {isDirty && (
            <Button variant="secondary" disabled={saving} onClick={discard}>
              {t('room.settings.permissions.discard')}
            </Button>
          )}
        </div>
      )}
    </div>
  );
};
