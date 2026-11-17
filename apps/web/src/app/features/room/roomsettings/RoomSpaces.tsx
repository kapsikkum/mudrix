import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { XIcon } from '@phosphor-icons/react';
import { parentSpacesOf, useAllJoinedSpaces, useClient, useSpaceGraph } from '@/app/data';
import { Button, IconButton } from '@/app/components/Button';
import { Select } from '@/app/components/Select';
import { useToast } from '@/app/hooks/useToast';
import { useRoomsWhereCanSendState } from '@/app/features/space/useStatePermissions';
import { getErrorMessage } from '@/util/error';
import * as css from '@/app/components/Settings/Settings.css';
import { vars } from '@/theme/vars.css';

/**
 * Which spaces a room belongs to: remove it from one, or add it to another space the user is
 * allowed to manage. The space's `m.space.child` is what makes the membership; the core keeps the
 * room's own `m.space.parent` in step where the user may set it.
 */
export function RoomSpacesSection({ roomId }: { roomId: string }) {
  const { t } = useTranslation();
  const client = useClient();
  const toast = useToast();
  const graph = useSpaceGraph();
  const spaces = useAllJoinedSpaces();
  const [selected, setSelected] = useState('');
  const [busy, setBusy] = useState(false);

  const spaceIds = useMemo(() => spaces.map((s) => s.id), [spaces]);
  const manageable = useRoomsWhereCanSendState(spaceIds, 'm.space.child');

  const parentIds = useMemo(() => new Set(parentSpacesOf(graph, roomId)), [graph, roomId]);
  const parents = spaces.filter((s) => parentIds.has(s.id));
  const addable = spaces.filter(
    (s) => s.id !== roomId && !parentIds.has(s.id) && manageable.has(s.id)
  );

  const add = async () => {
    if (!selected) return;
    setBusy(true);
    try {
      await client.addToSpace(selected, roomId, false);
      setSelected('');
    } catch (err) {
      toast.error(t('space.addExistingRoomFailed', { error: getErrorMessage(err) }));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (spaceId: string) => {
    setBusy(true);
    try {
      await client.removeFromSpace(spaceId, roomId);
    } catch (err) {
      toast.error(t('space.removeFailed', { error: getErrorMessage(err) }));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={css.section}>
      <h3 className={css.sectionTitle}>{t('room.settings.spaces.title')}</h3>

      {parents.length === 0 && <p className={css.settingNote}>{t('room.settings.spaces.none')}</p>}
      {parents.map((space) => (
        <div
          key={space.id}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '10px 12px',
            borderRadius: 8,
            backgroundColor: vars.color.bgSecondary,
            marginBottom: 6,
          }}
        >
          <span
            style={{
              flex: 1,
              minWidth: 0,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              color: vars.color.textPrimary,
            }}
          >
            {space.name}
          </span>
          {manageable.has(space.id) && (
            <IconButton
              size="sm"
              onClick={() => remove(space.id)}
              disabled={busy}
              aria-label={t('space.removeRoom')}
              tooltip={t('space.removeRoom')}
            >
              <XIcon size={14} />
            </IconButton>
          )}
        </div>
      ))}

      {addable.length > 0 && (
        <div className={css.flexRowWrap} style={{ marginTop: 12 }}>
          <div className={css.flexOne}>
            <Select
              aria-label={t('room.settings.spaces.addLabel')}
              value={selected}
              options={[
                { value: '', label: t('room.settings.spaces.choose') },
                ...addable.map((s) => ({ value: s.id, label: s.name })),
              ]}
              onChange={setSelected}
            />
          </div>
          <Button variant="secondary" onClick={add} disabled={!selected || busy}>
            {t('room.settings.spaces.add')}
          </Button>
        </div>
      )}
    </div>
  );
}
