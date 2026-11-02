import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { WizardClient } from '@wizardchat/core';
import { SpeakerHighIcon } from '@phosphor-icons/react';
import { Avatar } from '@/app/components/Avatar';
import { Button } from '@/app/components/Button';
import { Tooltip } from '@/app/components/Tooltip';
import { useDms } from '@/app/hooks/useDms';
import { useJoinVoiceRoom } from '@/app/features/calls/useJoinVoiceRoom';
import {
  parentSpacesOf,
  useAllRooms,
  useJoinedSpaces,
  useProfile,
  useSpaceGraph,
} from '@/app/data';
import { formatUserId } from '@/util/matrix';
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

function PersonName({ person }: { person: ActiveNowPerson }) {
  const { data: profile } = useProfile(person.known ? null : person.userId);
  return <span className={css.personName}>{profile?.displayName ?? person.name}</span>;
}

function PersonAvatar({ person, client }: { person: ActiveNowPerson; client: WizardClient }) {
  const { data: profile } = useProfile(person.known ? null : person.userId);
  return (
    <Avatar
      name={profile?.displayName ?? person.name}
      mxcUrl={person.avatarMxc ?? profile?.avatarUrl ?? null}
      client={client}
      size="xs"
      placeholder="logo"
    />
  );
}

export function ActiveNowPanel({ client }: { client: WizardClient }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const joinVoiceRoom = useJoinVoiceRoom(client);
  const dms = useDms();
  const rooms = useAllRooms();
  const spaces = useJoinedSpaces();
  const graph = useSpaceGraph();
  const myId = client.userId();

  const knownById = useMemo(() => new Map(dms.map((dm) => [dm.partnerId, dm])), [dms]);

  const cards = useMemo((): ActiveNowCard[] => {
    const list: ActiveNowCard[] = [];
    for (const room of rooms) {
      if (!room.isVoice || room.isInvite || room.callParticipants.length === 0) continue;
      const roomId = room.id;
      const userIds = [...new Set(room.callParticipants)];
      const people = userIds.map((userId) => {
        const dm = knownById.get(userId);
        return {
          userId,
          name: dm?.partnerName ?? formatUserId(userId),
          avatarMxc: dm?.partnerAvatarMxc ?? null,
          known: userId !== myId && !!dm,
        };
      });
      const knownCount = people.filter((p) => p.known).length;
      if (knownCount === 0) continue;
      people.sort((a, b) => Number(b.known) - Number(a.known));
      const parentId = parentSpacesOf(graph, roomId)[0];
      list.push({
        roomId,
        roomName: room.name ?? roomId,
        spaceName: parentId ? (spaces.find((s) => s.id === parentId)?.name ?? null) : null,
        people,
        knownCount,
        includesMe: !!myId && userIds.includes(myId),
      });
    }
    return list.sort((a, b) => b.knownCount - a.knownCount);
  }, [rooms, knownById, myId, graph, spaces]);

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
                      <PersonAvatar person={person} client={client} />
                      <PersonName person={person} />
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
