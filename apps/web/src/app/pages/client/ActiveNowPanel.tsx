import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { WizardClient } from '@wizardchat/core';
import { SpeakerHighIcon } from '@phosphor-icons/react';
import { Avatar } from '@/app/components/Avatar';
import { Button } from '@/app/components/Button';
import { Tooltip } from '@/app/components/Tooltip';
import { useJoinVoiceRoom } from '@/app/features/calls/useJoinVoiceRoom';
import { useProfile } from '@/app/data';
import { useActiveVoiceCards, type ActiveVoicePerson } from './useActiveVoiceCards';
import * as sidebarCss from './MembersSidebar.css';
import * as css from './ActiveNowPanel.css';

const PEOPLE_LIMIT = 5;

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
  client: WizardClient;
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

export function ActiveNowPanel({ client }: { client: WizardClient }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const joinVoiceRoom = useJoinVoiceRoom(client);
  const cards = useActiveVoiceCards(client, { onlyWithKnown: true });

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
