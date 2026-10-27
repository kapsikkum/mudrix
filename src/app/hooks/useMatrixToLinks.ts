import { useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAtomValue, useSetAtom } from 'jotai';
import { useTranslation } from 'react-i18next';
import { EventType, type MatrixClient, type Room } from 'matrix-js-sdk';
import { currentRoomIdAtom, pendingEventJumpAtom, userProfileAtom } from '@/app/store/atoms';
import { STORAGE_KEY_PENDING_LINK } from '@/const/storageKeys';
import { parseMatrixToFragment, parseMatrixToUrl, type MatrixToTarget } from '@/util/matrixTo';
import { isDmRoom, isSpace } from '@/util/matrix';
import { getErrorMessage } from '@/util/error';
import { startDm } from './useDms';
import { useConfirm } from './useConfirm';
import { useSyncReady } from './useSync';
import { useToast } from './useToast';

function roomPath(room: Room, client: MatrixClient): string {
  const id = encodeURIComponent(room.roomId);
  if (isSpace(room)) return `/space/${id}`;
  return isDmRoom(room, client) ? `/dm/${id}` : `/r/${id}`;
}

function existingDmRoomId(client: MatrixClient, userId: string): string | null {
  const direct = client.getAccountData(EventType.Direct)?.getContent<Record<string, string[]>>();
  return direct?.[userId]?.find((id) => client.getRoom(id)?.getMyMembership() === 'join') ?? null;
}

export function useMatrixToLinks(client: MatrixClient | null): void {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const toast = useToast();
  const syncReady = useSyncReady();
  const currentRoomId = useAtomValue(currentRoomIdAtom);
  const setProfile = useSetAtom(userProfileAtom);
  const setPendingJump = useSetAtom(pendingEventJumpAtom);

  const open = useCallback(
    async (target: MatrixToTarget, anchor?: Element) => {
      if (!client) return;
      try {
        if (target.kind === 'user') {
          if (target.userId === client.getUserId()) return;
          if (anchor) {
            const rect = anchor.getBoundingClientRect();
            setProfile({
              userId: target.userId,
              roomId: currentRoomId,
              anchorRect: {
                top: rect.top,
                left: rect.left,
                width: rect.width,
                height: rect.height,
              },
            });
            return;
          }
          let roomId = existingDmRoomId(client, target.userId);
          if (!roomId) {
            const ok = await confirm({
              title: t('link.startDmTitle'),
              message: t('link.startDmMessage', { user: target.userId }),
              confirmLabel: t('link.startDm'),
            });
            if (!ok) return;
            roomId = await startDm(client, target.userId);
          }
          navigate(`/dm/${encodeURIComponent(roomId)}`);
          return;
        }

        const { roomIdOrAlias, viaServers, eventId } = target;
        let room: Room | null = null;
        if (roomIdOrAlias.startsWith('#')) {
          room =
            client
              .getRooms()
              .find(
                (r) =>
                  r.getCanonicalAlias() === roomIdOrAlias ||
                  r.getAltAliases().includes(roomIdOrAlias)
              ) ?? null;
        } else {
          room = client.getRoom(roomIdOrAlias);
        }

        if (room?.getMyMembership() !== 'join') {
          const ok = await confirm({
            title: t('link.joinTitle'),
            message: t('link.joinMessage', { room: room?.name || roomIdOrAlias }),
            confirmLabel: t('link.join'),
          });
          if (!ok) return;
          room = await client.joinRoom(
            roomIdOrAlias,
            viaServers.length > 0 ? { viaServers } : undefined
          );
        }

        navigate(roomPath(room, client));
        if (eventId) setPendingJump({ roomId: room.roomId, eventId });
      } catch (err) {
        toast.error(t('link.failed', { error: getErrorMessage(err) }));
      }
    },
    [client, confirm, currentRoomId, navigate, setPendingJump, setProfile, t, toast]
  );

  useEffect(() => {
    if (!client || !syncReady) return;
    const fragment = sessionStorage.getItem(STORAGE_KEY_PENDING_LINK);
    if (!fragment) return;
    sessionStorage.removeItem(STORAGE_KEY_PENDING_LINK);
    const target = parseMatrixToFragment(fragment);
    if (target) void open(target);
  }, [client, syncReady, open]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey)
        return;
      const anchor = (e.target as Element | null)?.closest?.('a[href]');
      if (!anchor) return;
      const target = parseMatrixToUrl((anchor as HTMLAnchorElement).href);
      if (!target) return;
      e.preventDefault();
      void open(target, anchor);
    };
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, [open]);
}
