import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { MudrixClient } from '@mudrix/core';
import { GameControllerIcon, SpeakerHighIcon } from '@phosphor-icons/react';
import { Avatar } from '@/app/components/Avatar';
import { Button } from '@/app/components/Button';
import { Tooltip } from '@/app/components/Tooltip';
import { useJoinVoiceRoom } from '@/app/features/calls/useJoinVoiceRoom';
import { ActivityIcon } from '@/app/features/profile/ActivityIcon';
import { activityText } from '@/app/hooks/useExtendedProfile';
import { useProfile } from '@/app/data';
import { useActiveVoiceCards, type ActiveVoicePerson } from './useActiveVoiceCards';
import { useFriendActivities } from './useFriendActivities';
import * as sidebarCss from './MembersSidebar.css';
import * as css from './ActiveNowPanel.css';

const PEOPLE_LIMIT = 5;
const FRIENDS_LIMIT = 5;

function PersonName({ person }: { person: ActiveVoicePerson }) {
  const { data: profile } = useProfile(person.known ? null : person.userId);
  return <span className={css.personName}>{profile?.displayName ?? person.name}</span>;
}

export function PersonAvatar({
  person,
  client,
  size = 'xs',
}: {
  person: ActiveVoicePerson;
  client: MudrixClient;
  size?: 'xs' | 'sm';
}) {
  const { data: profile } = useProfile(person.known ? null : person.userId);
  return (
    <Avatar
      name={profile?.displayName ?? person.name}
      mxcUrl={person.avatarMxc ?? profile?.avatarUrl ?? null}
      client={client}
      size={size}
      placeholder="logo"
    />
  );
}

export function ActiveNowPanel({ client }: { client: MudrixClient }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const joinVoiceRoom = useJoinVoiceRoom(client);
  const cards = useActiveVoiceCards(client, { onlyWithKnown: true });
  const friends = useFriendActivities(client);

  return (
    <aside className={css.panel} aria-label={t('nav.activeNow')}>
      <div className={sidebarCss.membersSidebarHeader}>
        <span className={sidebarCss.membersSidebarTitle}>{t('nav.activeNow')}</span>
      </div>
      <div className={css.list}>
        {cards.length === 0 && friends.length === 0 ? (
          <div className={css.empty}>{t('nav.activeNowEmpty')}</div>
        ) : (
          <>
            {cards.map(({ roomId, roomName, spaceName, people, includesMe }) => {
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
                        {t('nav.morePeople', { count: people.length - shown.length })}
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
                    {includesMe ? t('common.open') : t('common.join')}
                  </Button>
                </div>
              );
            })}

            {friends.length > 0 && (
              <section className={css.friendsCard} aria-label={t('timeline.home.friendsHeading')}>
                <div className={css.friendsHeader}>
                  <span className={css.friendsIcon} aria-hidden>
                    <GameControllerIcon size={15} weight="fill" />
                  </span>
                  <span className={css.friendsTitle}>{t('timeline.home.friendsHeading')}</span>
                </div>
                <div className={css.friendsList}>
                  {friends.slice(0, FRIENDS_LIMIT).map((friend) => (
                    <button
                      key={friend.userId}
                      type="button"
                      className={css.friendRow}
                      onClick={() => navigate(`/dm/${encodeURIComponent(friend.roomId)}`)}
                    >
                      <Avatar
                        name={friend.name}
                        mxcUrl={friend.avatarMxc}
                        client={client}
                        size="sm"
                        placeholder="logo"
                      />
                      <span className={css.friendText}>
                        <span className={css.friendName}>{friend.name}</span>
                        {friend.activities.map((activity) => (
                          <span
                            key={`${activity.type}:${activity.name}`}
                            className={css.friendActivity}
                          >
                            <ActivityIcon
                              type={activity.type}
                              size={13}
                              className={css.friendActivityIcon}
                            />
                            {activityText(t, activity)}
                          </span>
                        ))}
                      </span>
                    </button>
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </aside>
  );
}
