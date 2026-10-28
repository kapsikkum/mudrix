import { useState, useCallback } from 'react';
import type { MatrixClient, MatrixEvent, RoomMember } from 'matrix-js-sdk';
import { useTranslation } from 'react-i18next';
import { useAtomValue } from 'jotai';
import { connectionLostAtom, typingIndicatorsAtom } from '@/app/store/atoms';
import { useMatrixEvent } from '@/app/hooks/useMatrixEvent';
import { Avatar } from '@/app/components/Avatar';
import { formatUserId } from '@/util/matrix';
import * as css from './TypingIndicator.css';

interface TypingUser {
  userId: string;
  displayName: string;
  avatarMxc: string | null;
}

function useTypingUsers(client: MatrixClient, roomId: string): TypingUser[] {
  const room = client.getRoom(roomId);
  const myUserId = client.getUserId() ?? '';
  const [typingUserIds, setTypingUserIds] = useState<Set<string>>(new Set());

  const handleTyping = useCallback(
    (_event: MatrixEvent, member: RoomMember) => {
      if (member.roomId !== roomId || member.userId === myUserId) return;
      setTypingUserIds((prev) => {
        const next = new Set(prev);
        if (member.typing) next.add(member.userId);
        else next.delete(member.userId);
        return next;
      });
    },
    [roomId, myUserId]
  );

  useMatrixEvent(client, 'RoomMember.typing', handleTyping);

  return Array.from(typingUserIds).map((id) => {
    const member = room?.getMember(id);
    return {
      userId: id,
      displayName: member?.name ?? formatUserId(id),
      avatarMxc: member?.getMxcAvatarUrl() ?? null,
    };
  });
}

interface Props {
  client: MatrixClient;
  roomId: string;
}

export function TypingIndicator({ client, roomId }: Props) {
  const { t } = useTranslation();
  const typingIndicators = useAtomValue(typingIndicatorsAtom);
  const users = useTypingUsers(client, roomId);

  if (users.length === 0 || !typingIndicators) return null;

  const names = users.map((u) => u.displayName).join(', ');

  return (
    <div className={css.typingIndicator} role="status" aria-live="polite" aria-atomic="true">
      <div className={css.avatars}>
        {users.map((u) => (
          <div key={u.userId} className={css.stackedAvatar}>
            <Avatar
              name={u.displayName}
              mxcUrl={u.avatarMxc}
              client={client}
              size="xs"
              placeholder="logo"
            />
          </div>
        ))}
      </div>
      <span className={css.text}>{t('room.header.typing', { names, count: users.length })}</span>
    </div>
  );
}

interface ComposerStatusProps extends Props {
  showTyping: boolean;
}

export function ComposerStatus({ client, roomId, showTyping }: ComposerStatusProps) {
  const { t } = useTranslation();
  const connectionLost = useAtomValue(connectionLostAtom);

  if (!connectionLost) {
    return showTyping ? <TypingIndicator client={client} roomId={roomId} /> : null;
  }

  return (
    <div className={css.offline} role="status" aria-live="polite" aria-atomic="true">
      <span className={css.spinner} aria-hidden="true" />
      <span className={css.text}>{t('banner.offline')}</span>
    </div>
  );
}
