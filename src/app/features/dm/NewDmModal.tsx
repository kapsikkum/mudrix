import { useState, useCallback } from 'react';
import { useAtom, useSetAtom } from 'jotai';
import { useTranslation } from 'react-i18next';
import { newDmOpenAtom, currentRoomIdAtom as roomAtom, recentInvitesAtom } from '@/app/store/atoms';
import { getMatrixClient, getMatrixClientOrNull } from '@/client/initMatrix';
import { useToast } from '@/app/hooks/useToast';
import { startDm } from '@/app/hooks/useDms';
import { getErrorMessage } from '@/util/error';
import { isInviteBlockedError } from '@/app/hooks/useInviteBlocking';
import { formatUserId } from '@/util/matrix';
import { useNavigate } from 'react-router-dom';
import { ChatCircleIcon } from '@phosphor-icons/react';
import { Modal } from '@/app/components/Modal';
import { Button } from '@/app/components/Button';
import { UserPickerInput } from '@/app/features/room/UserPickerInput';
import type { UserSuggestion } from '@/app/features/room/useInviteAutocomplete';

export function NewDmModal() {
  const { t } = useTranslation();
  const [open, setOpen] = useAtom(newDmOpenAtom);
  const [, setCurrentRoom] = useAtom(roomAtom);
  const setRecentInvites = useSetAtom(recentInvitesAtom);
  const [userId, setUserId] = useState('');
  const [loading, setLoading] = useState(false);
  const toast = useToast();
  const navigate = useNavigate();
  const client = getMatrixClientOrNull();

  const close = useCallback(() => {
    setOpen(false);
    setUserId('');
  }, [setOpen]);

  const canStart = userId.trim().length > 0;

  const handleStart = useCallback(
    async (targetUserId?: string) => {
      const id = (targetUserId ?? userId).trim();
      if (!id) return;
      setLoading(true);
      try {
        const mx = getMatrixClient();
        const roomId = await startDm(mx, id);

        // Track for future recent suggestions
        const user = mx.getUser(id);
        const displayName = user?.displayName ?? formatUserId(id);
        const avatarMxc = user?.avatarUrl ?? null;
        setRecentInvites((prev) => {
          const next = prev.filter((u) => u.userId !== id);
          next.unshift({ userId: id, displayName, avatarMxc, timestamp: Date.now() });
          return next.slice(0, 20);
        });

        setCurrentRoom(roomId);
        navigate(`/dm/${encodeURIComponent(roomId)}`);
        close();
      } catch (err) {
        toast.error(
          isInviteBlockedError(err)
            ? t('invite.inviteBlocked', { id })
            : t('room.dm.startFailed', { error: getErrorMessage(err) })
        );
      } finally {
        setLoading(false);
      }
    },
    [userId, setCurrentRoom, navigate, close, toast, t]
  );

  const handleSelect = useCallback((suggestion: UserSuggestion) => {
    setUserId(suggestion.userId);
  }, []);

  if (!client) return null;

  return (
    <Modal
      open={open}
      onClose={close}
      title={t('room.dm.newDm')}
      titleIcon={<ChatCircleIcon size={18} weight="fill" />}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={close}>
            {t('common.cancel')}
          </Button>
          <Button
            variant="primary"
            loading={loading}
            onClick={() => handleStart()}
            disabled={!canStart}
          >
            {t('room.dm.startChat')}
          </Button>
        </>
      }
    >
      {open && (
        <UserPickerInput
          client={client}
          value={userId}
          onValueChange={setUserId}
          onPick={handleSelect}
          onSubmit={() => void handleStart()}
          label={t('invite.userId')}
          autoFocus
        />
      )}
    </Modal>
  );
}
