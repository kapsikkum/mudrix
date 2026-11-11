import { useMemo } from 'react';
import { useSetAtom } from 'jotai';
import { useTranslation } from 'react-i18next';
import {
  ArrowDownIcon,
  ArrowUpIcon,
  HashIcon,
  PlusIcon,
  StackIcon,
  XIcon,
} from '@phosphor-icons/react';
import { addRoomToSpaceAtom, createRoomOpenAtom, createSpaceOpenAtom } from '@/app/store/atoms';
import { useAllJoinedSpaces, useAllRooms, useClient, useSpaceGraph } from '@/app/data';
import { Button, IconButton } from '@/app/components/Button';
import { Toggle } from '@/app/components/Toggle';
import { useConfirm } from '@/app/hooks/useConfirm';
import { useToast } from '@/app/hooks/useToast';
import { getErrorMessage } from '@/util/error';
import { compareSpaceChildren } from '@/app/features/room/roomOrder';
import { moveSpaceChild } from '../spaceOrder';
import { useRoomsWhereCanSendState } from '../useStatePermissions';
import * as css from '@/app/components/Settings/Settings.css';
import * as chCss from './Channels.css';

interface Child {
  roomId: string;
  name: string;
  isSpace: boolean;
  suggested: boolean;
}

/**
 * The rooms of a Matrix style space, managed the way Matrix does it: a plain list you can add
 * existing rooms and spaces to, create rooms (voice rooms too) and sub-spaces in, take them out of
 * the space, and mark as suggested. Categories and set channel order are part of the Modern style.
 */
export function MatrixRoomsPanel({ spaceId }: { spaceId: string }) {
  const { t } = useTranslation();
  const client = useClient();
  const toast = useToast();
  const confirmDialog = useConfirm();
  const setCreateRoom = useSetAtom(createRoomOpenAtom);
  const setAddRoom = useSetAtom(addRoomToSpaceAtom);
  const setCreateSpace = useSetAtom(createSpaceOpenAtom);
  const graph = useSpaceGraph();
  const rooms = useAllRooms();
  const spaces = useAllJoinedSpaces();
  const editable = useRoomsWhereCanSendState([spaceId], 'm.space.child').has(spaceId);

  const node = useMemo(() => graph.find((s) => s.spaceId === spaceId), [graph, spaceId]);
  const children = useMemo<Child[]>(() => {
    const names = new Map<string, string>([
      ...rooms.map((r) => [r.id, r.name ?? r.id] as const),
      ...spaces.map((s) => [s.id, s.name] as const),
    ]);
    const spaceIds = new Set(graph.map((s) => s.spaceId));
    return [...(node?.children ?? [])]
      .sort((a, b) =>
        compareSpaceChildren(
          { roomId: a.roomId, order: a.order ?? undefined, ts: a.timestamp },
          { roomId: b.roomId, order: b.order ?? undefined, ts: b.timestamp }
        )
      )
      .map((c) => ({
        roomId: c.roomId,
        name: names.get(c.roomId) ?? c.roomId,
        isSpace: spaceIds.has(c.roomId),
        suggested: c.suggested,
      }));
  }, [node, rooms, spaces, graph]);

  const fail = (err: unknown) => toast.error(t('room.moveFailed', { error: getErrorMessage(err) }));
  const spaceName = spaces.find((s) => s.id === spaceId)?.name ?? '';

  const setSuggested = (child: Child, suggested: boolean) => {
    client
      .updateSpaceChild(spaceId, child.roomId, suggested, undefined, false)
      .catch((err: unknown) => toast.error(t('common.error', { error: getErrorMessage(err) })));
  };

  const remove = async (child: Child) => {
    const confirmed = await confirmDialog({
      title: t('room.space.removeRoomConfirmTitle', { name: child.name }),
      message: t('room.space.removeRoomConfirmMessage', { name: child.name }),
      confirmLabel: t('space.removeRoom'),
      danger: true,
    });
    if (!confirmed) return;
    try {
      await client.removeFromSpace(spaceId, child.roomId);
    } catch (err) {
      toast.error(t('space.removeFailed', { error: getErrorMessage(err) }));
    }
  };

  const ids = children.map((c) => c.roomId);

  return (
    <div className={css.section}>
      <h2 className={css.panelTitle}>{t('room.settings.channels.title')}</h2>
      <p className={css.settingNote}>{t('room.settings.channels.matrixIntro')}</p>
      {editable && (
        <div className={chCss.toolbar}>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setAddRoom({ open: true, spaceId, spaceName })}
          >
            <PlusIcon size={14} className={css.iconBefore} />
            {t('space.addExistingRoom')}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setCreateRoom({ open: true, spaceId, spaceName })}
          >
            <HashIcon size={14} className={css.iconBefore} />
            {t('room.settings.channels.createRoom')}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() =>
              setCreateSpace({ open: true, parentSpaceId: spaceId, parentSpaceName: spaceName })
            }
          >
            <StackIcon size={14} className={css.iconBefore} />
            {t('space.createSubspace')}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setAddRoom({ open: true, spaceId, spaceName, type: 'subspace' })}
          >
            <StackIcon size={14} className={css.iconBefore} />
            {t('space.addExistingSubSpace')}
          </Button>
        </div>
      )}
      {children.length === 0 && (
        <p className={css.settingNote}>{t('room.settings.channels.empty')}</p>
      )}
      {children.map((child, index) => (
        <div key={child.roomId} className={chCss.row} data-testid="matrix-room-row">
          <div className={chCss.head}>
            {child.isSpace ? <StackIcon size={16} /> : <HashIcon size={16} />}
            <span className={chCss.rowName}>{child.name}</span>
            {editable && (
              <>
                <span className={css.permRowRole}>{t('space.suggested')}</span>
                <Toggle
                  size="sm"
                  checked={child.suggested}
                  ariaLabel={t('space.suggested')}
                  onChange={(on) => setSuggested(child, on)}
                />
                <IconButton
                  aria-label={t('room.moveUp')}
                  disabled={index === 0}
                  onClick={() => moveSpaceChild(client, node, ids, child.roomId, -1).catch(fail)}
                >
                  <ArrowUpIcon size={14} />
                </IconButton>
                <IconButton
                  aria-label={t('room.moveDown')}
                  disabled={index === children.length - 1}
                  onClick={() => moveSpaceChild(client, node, ids, child.roomId, 1).catch(fail)}
                >
                  <ArrowDownIcon size={14} />
                </IconButton>
                <IconButton
                  danger
                  aria-label={t('space.removeRoom')}
                  tooltip={t('space.removeRoom')}
                  onClick={() => remove(child)}
                >
                  <XIcon size={14} />
                </IconButton>
              </>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
