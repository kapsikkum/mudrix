import { useState, useCallback, useEffect } from 'react';
import { useAtom, useSetAtom } from 'jotai';
import { useTranslation } from 'react-i18next';
import { UserPlusIcon } from '@phosphor-icons/react';
import { inviteModalRoomIdAtom, recentInvitesAtom } from '@/app/store/atoms';
import { getMatrixClient, getMatrixClientOrNull } from '@/client/initMatrix';
import { useToast } from '@/app/hooks/useToast';
import { getErrorMessage } from '@/util/error';
import { isInviteBlockedError } from '@/app/hooks/useInviteBlocking';
import { formatUserId } from '@/util/matrix';
import { Modal } from '@/app/components/Modal';
import { Button } from '@/app/components/Button';
import { UserPickerInput } from './UserPickerInput';
import type { UserSuggestion } from './useInviteAutocomplete';

export function InviteModal() {
  const { t } = useTranslation();
  const [state, setState] = useAtom(inviteModalRoomIdAtom);
  const setRecentInvites = useSetAtom(recentInvitesAtom);
  const [userId, setUserId] = useState('');
  const [loading, setLoading] = useState(false);
  const toast = useToast();
  const client = getMatrixClientOrNull();

  const isOpen = !!state;

  // Defensive guard, you can only invite others to a room you have actually
  // joined. If somehow opened for an invited/left room, close immediately.
  useEffect(() => {
    if (!isOpen || !state || !client) return;
    const room = client.getRoom(state.roomId);
    if (room && room.getMyMembership() !== 'join') {
      setState(null);
      toast.error(t('invite.joinRequired'));
    }
  }, [isOpen, state, client, setState, toast, t]);

  const close = useCallback(() => {
    setState(null);
    setUserId('');
  }, [setState]);

  const canInvite = userId.trim().length > 0;

  const handleInvite = useCallback(
    async (targetUserId?: string) => {
      const id = (targetUserId ?? userId).trim();
      if (!id) return;
      if (!state || !client) return;

      setLoading(true);
      try {
        const mx = getMatrixClient();

        await mx.invite(state.roomId, id);

        // Track for future recent suggestions
        const user = mx.getUser(id);
        const displayName = user?.displayName ?? formatUserId(id);
        const avatarMxc = user?.avatarUrl ?? null;
        setRecentInvites((prev) => {
          const next = prev.filter((u) => u.userId !== id);
          next.unshift({ userId: id, displayName, avatarMxc, timestamp: Date.now() });
          return next.slice(0, 20);
        });

        toast.success(t('invite.invitedTo', { id, name: state.name }));

        close();
      } catch (err) {
        toast.error(
          isInviteBlockedError(err)
            ? t('invite.inviteBlocked', { id })
            : t('invite.inviteFailed', { error: getErrorMessage(err) })
        );
      } finally {
        setLoading(false);
      }
    },
    [userId, state, client, close, toast, t]
  );

  // Picking a suggestion fills the input, the user still confirms with Invite
  const handleSelect = useCallback((suggestion: UserSuggestion) => {
    setUserId(suggestion.userId);
  }, []);

  if (!client) return null;

  return (
    <Modal
      open={!!state}
      onClose={close}
      title={state ? t('invite.inviteTo', { name: state.name }) : t('invite.title')}
      titleIcon={<UserPlusIcon size={18} weight="fill" />}
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={close}>
            {t('common.cancel')}
          </Button>
          <Button
            variant="primary"
            loading={loading}
            onClick={() => handleInvite()}
            disabled={!canInvite}
          >
            {t('common.invite')}
          </Button>
        </>
      }
    >
      {client && isOpen && (
        <UserPickerInput
          client={client}
          value={userId}
          onValueChange={setUserId}
          onPick={handleSelect}
          onSubmit={() => void handleInvite()}
          label={t('invite.userId')}
          autoFocus
        />
      )}
    </Modal>
  );
}
