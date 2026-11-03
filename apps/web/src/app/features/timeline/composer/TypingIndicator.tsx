import { Fragment } from 'react';
import type { RoomTimeline, WizardClient as MatrixClient } from '@wizardchat/core';
import { useTranslation } from 'react-i18next';
import { useAtomValue } from 'jotai';
import { connectionLostAtom, typingIndicatorsAtom } from '@/app/store/atoms';
import { useMembers, useTypingUsers as useTimelineTypingUsers } from '@/app/data';
import { Avatar } from '@/app/components/Avatar';
import { useUsernameColor } from '@/app/hooks/useUsernameColor';
import { formatUserId } from '@/util/matrix';
import * as css from './TypingIndicator.css';

interface TypingUser {
  userId: string;
  displayName: string;
  avatarMxc: string | null;
}

function useTypingUsers(roomId: string, timeline: RoomTimeline | null): TypingUser[] {
  const typing = useTimelineTypingUsers(timeline);
  const { data: members } = useMembers(roomId);

  return typing.map(({ userId, displayName }) => {
    const member = members?.find((m) => m.userId === userId);
    return {
      userId,
      displayName: member?.displayName ?? displayName ?? formatUserId(userId),
      avatarMxc: member?.avatarUrl ?? null,
    };
  });
}

interface Props {
  client: MatrixClient;
  roomId: string;
  timeline: RoomTimeline | null;
}

export function TypingIndicator({ client, roomId, timeline }: Props) {
  const { t } = useTranslation();
  const typingIndicators = useAtomValue(typingIndicatorsAtom);
  const users = useTypingUsers(roomId, timeline);
  const colorFor = useUsernameColor();

  if (users.length === 0 || !typingIndicators) return null;

  const marker = '\u0000';
  const [before, after] = t('room.header.typing', { names: marker, count: users.length }).split(
    marker
  );

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
      <span className={css.text}>
        {before}
        {users.map((u, i) => (
          <Fragment key={u.userId}>
            {i > 0 && ', '}
            <span className={css.name} style={{ color: colorFor(u.userId) }}>
              {u.displayName}
            </span>
          </Fragment>
        ))}
        {after}
      </span>
    </div>
  );
}

interface ComposerStatusProps extends Props {
  showTyping: boolean;
}

export function ComposerStatus({ client, roomId, timeline, showTyping }: ComposerStatusProps) {
  const { t } = useTranslation();
  const connectionLost = useAtomValue(connectionLostAtom);

  if (!connectionLost) {
    return showTyping ? (
      <TypingIndicator client={client} roomId={roomId} timeline={timeline} />
    ) : null;
  }

  return (
    <div className={css.offline} role="status" aria-live="polite" aria-atomic="true">
      <span className={css.spinner} aria-hidden="true" />
      <span className={css.text}>{t('banner.offline')}</span>
    </div>
  );
}
