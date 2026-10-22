import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { MatrixClient } from 'matrix-js-sdk';
import { SpeakerHighIcon } from '@phosphor-icons/react';
import { Avatar } from '@/app/components/Avatar';
import { Button } from '@/app/components/Button';
import { Tooltip } from '@/app/components/Tooltip';
import { useDms } from '@/app/hooks/useDms';
import { useElementCallMemberships } from '@/app/features/calls/useElementCallMemberships';
import { useJoinVoiceRoom } from '@/app/features/calls/useJoinVoiceRoom';
import { useRoomEntries } from '@/app/features/roomSwitcher/roomEntries';
import { findParentSpaceId, formatUserId } from '@/util/matrix';
import * as sidebarCss from './MembersSidebar.css';
import * as css from './ActiveNowPanel.css';

const PEOPLE_LIMIT = 5;

interface ActiveNowPerson {
  userId: string;
  name: string;
  avatarMxc: string | null;
  known: boolean;
}

interface ActiveNowCard {
  roomId: string;
  roomName: string;
  spaceName: string | null;
  people: ActiveNowPerson[];
  knownCount: number;
  includesMe: boolean;
}

export function ActiveNowPanel({ client }: { client: MatrixClient }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const joinVoiceRoom = useJoinVoiceRoom(client);
  const dms = useDms(client);
  const entries = useRoomEntries();
  const myId = client.getUserId();

  const knownIds = useMemo(() => new Set(dms.map((dm) => dm.partnerId)), [dms]);
  const voiceRoomIds = useMemo(
    () => entries.filter((e) => e.kind === 'room' && e.isVoice).map((e) => e.roomId),
    [entries]
  );
  const memberships = useElementCallMemberships(client, voiceRoomIds);

  const cards = useMemo((): ActiveNowCard[] => {
    const list: ActiveNowCard[] = [];
    for (const [roomId, members] of memberships) {
      const room = client.getRoom(roomId);
      if (!room) continue;
      const userIds = [...new Set(members.map((m) => m.userId))];
      const people = userIds.map((userId) => {
        const member = room.getMember(userId);
        return {
          userId,
          name: member?.name ?? formatUserId(userId),
          avatarMxc: member?.getMxcAvatarUrl() ?? null,
          known: userId !== myId && knownIds.has(userId),
        };
      });
      const knownCount = people.filter((p) => p.known).length;
      if (knownCount === 0) continue;
      people.sort((a, b) => Number(b.known) - Number(a.known));
      const parentId = findParentSpaceId(roomId, client);
      list.push({
        roomId,
        roomName: room.name,
        spaceName: parentId ? (client.getRoom(parentId)?.name ?? null) : null,
        people,
        knownCount,
        includesMe: !!myId && userIds.includes(myId),
      });
    }
    return list.sort((a, b) => b.knownCount - a.knownCount);
  }, [memberships, client, knownIds, myId]);

  return (
    <aside className={css.panel} aria-label={t('home.activeNow')}>
      <div className={sidebarCss.membersSidebarHeader}>
        <span className={sidebarCss.membersSidebarTitle}>{t('home.activeNow')}</span>
      </div>
      <div className={css.list}>
        {cards.length === 0 ? (
          <div className={css.empty}>{t('home.activeNowEmpty')}</div>
        ) : (
          cards.map(({ roomId, roomName, spaceName, people, includesMe }) => {
            const shown = people.slice(0, PEOPLE_LIMIT);
            return (
              <div key={roomId} className={css.card}>
                <div className={css.room}>
                  <span className={css.roomName}>
                    <SpeakerHighIcon size={14} weight="fill" className={css.liveIcon} />
                    <Tooltip content={roomName} multiline>
                      <span className={css.roomNameText}>{roomName}</span>
                    </Tooltip>
                  </span>
                  {spaceName && <span className={css.spaceName}>{spaceName}</span>}
                </div>
                <div className={css.people}>
                  {shown.map((person) => (
                    <div
                      key={person.userId}
                      className={person.known ? css.personKnown : css.person}
                    >
                      <Avatar
                        name={person.name}
                        mxcUrl={person.avatarMxc}
                        client={client}
                        size="xs"
                        placeholder="logo"
                      />
                      <span className={css.personName}>{person.name}</span>
                    </div>
                  ))}
                  {people.length > shown.length && (
                    <span className={css.more}>
                      {t('home.morePeople', { count: people.length - shown.length })}
                    </span>
                  )}
                </div>
                <Button
                  size="sm"
                  variant={includesMe ? 'secondary' : 'primary'}
                  fullWidth
                  onClick={() => {
                    if (includesMe) navigate(`/r/${encodeURIComponent(roomId)}`);
                    else void joinVoiceRoom(roomId);
                  }}
                >
                  {includesMe ? t('home.open') : t('home.join')}
                </Button>
              </div>
            );
          })
        )}
      </div>
    </aside>
  );
}
