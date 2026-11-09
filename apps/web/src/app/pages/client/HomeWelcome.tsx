import { useMemo, type CSSProperties, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAtomValue, useSetAtom } from 'jotai';
import { Trans, useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import type { WizardClient } from '@wizardchat/core';
import {
  BellRingingIcon,
  CameraIcon,
  CaretRightIcon,
  ChatCircleIcon,
  ClockCounterClockwiseIcon,
  CompassIcon,
  EnvelopeSimpleIcon,
  GameControllerIcon,
  LockKeyIcon,
  ShieldWarningIcon,
  SparkleIcon,
  SpeakerHighIcon,
  StackIcon,
} from '@phosphor-icons/react';
import {
  createSpaceOpenAtom,
  exploreOpenAtom,
  inboxOpenAtom,
  newDmOpenAtom,
  pendingEventJumpAtom,
  sessionVerificationAtom,
  settingsOpenAtom,
  settingsPageAtom,
  whatsNewOpenAtom,
  type SettingsPage,
} from '@/app/store/atoms';
import { Avatar } from '@/app/components/Avatar';
import { Button } from '@/app/components/Button';
import { LogoHover } from '@/app/components/AppLoading';
import { parentSpacesOf, useAllJoinedSpaces, useProfile, useSpaceGraph } from '@/app/data';
import { activityText } from '@/app/hooks/useExtendedProfile';
import { useInvites, type Invite } from '@/app/features/inbox/useInvites';
import { useMentions, type Mention } from '@/app/features/inbox/useMentions';
import { useJoinVoiceRoom } from '@/app/features/calls/useJoinVoiceRoom';
import { useRoomEntries, type RoomEntry } from '@/app/features/roomSwitcher/roomEntries';
import { latestWhatsNew } from '@/app/features/whatsNew';
import { ACTIVITY_EMOJI } from '@/util/profileActivity';
import { formatUserId } from '@/util/matrix';
import { MODIFIER_KEY } from '@/app/util/platform';
import { PersonAvatar } from './ActiveNowPanel';
import { useActiveVoiceCards } from './useActiveVoiceCards';
import { useFriendActivities } from './useFriendActivities';
import * as css from './HomeWelcome.css';

const CATCH_UP_INVITES = 3;
const CATCH_UP_MENTIONS = 4;
const RECENT_ROOMS = 6;
const LIVE_ROOMS = 4;
const LIVE_AVATARS = 4;
const FRIENDS_SHOWN = 5;
const NOTES_SHOWN = 4;

/** Puts a block in line for the staggered entrance. */
const step = (i: number) => ({ '--i': i }) as CSSProperties;

interface Action {
  id: string;
  icon: ReactNode;
  title: string;
  description: string;
  onClick: () => void;
  warning?: boolean;
}

const roomPath = (kind: 'room' | 'dm' | 'space', roomId: string) =>
  `/${kind === 'dm' ? 'dm' : kind === 'space' ? 'space' : 'r'}/${encodeURIComponent(roomId)}`;

/** "5 min. ago" in the viewer's language; "just now" under a minute. */
function relativeTime(t: TFunction, language: string, ts: number): string {
  const seconds = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (seconds < 60) return t('timeline.home.justNow');
  const rtf = new Intl.RelativeTimeFormat(language, { numeric: 'auto', style: 'short' });
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return rtf.format(-minutes, 'minute');
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return rtf.format(-hours, 'hour');
  const days = Math.floor(hours / 24);
  if (days < 30) return rtf.format(-days, 'day');
  return new Intl.DateTimeFormat(language, { month: 'short', day: 'numeric' }).format(ts);
}

/** The first few bullets of the release notes as plain text (links, code and emphasis stripped). */
function noteHighlights(markdown: string): string[] {
  const notes: string[] = [];
  let sections = 0;
  for (const line of markdown.split(/\r?\n/)) {
    // Only the first section (what is new); the next one lists fixes.
    if (/^##\s/.test(line)) sections += 1;
    if (sections > 1) break;
    const match = /^\s*[-*]\s+(.+)$/.exec(line);
    if (!match) continue;
    notes.push(
      match[1]
        .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
        .replace(/[`*_]/g, '')
        .trim()
    );
    if (notes.length >= NOTES_SHOWN) break;
  }
  return notes;
}

function Panel({
  id,
  index,
  icon,
  title,
  action,
  className,
  children,
}: {
  id: string;
  index: number;
  icon: ReactNode;
  title: string;
  action?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      className={`${css.panel} ${css.enter}${className ? ` ${className}` : ''}`}
      style={step(index)}
      aria-labelledby={id}
    >
      <header className={css.panelHeader}>
        <span className={css.panelIcon} aria-hidden>
          {icon}
        </span>
        <h2 id={id} className={css.panelTitle}>
          {title}
        </h2>
        {action}
      </header>
      {children}
    </section>
  );
}

/** The Home tab once signed in: a dashboard of what needs you, what is going on, and the way in. */
export function HomeWelcome({ client }: { client: WizardClient }) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const setNewDmOpen = useSetAtom(newDmOpenAtom);
  const setCreateSpaceOpen = useSetAtom(createSpaceOpenAtom);
  const setExploreOpen = useSetAtom(exploreOpenAtom);
  const setSettingsOpen = useSetAtom(settingsOpenAtom);
  const setSettingsPage = useSetAtom(settingsPageAtom);
  const setInboxOpen = useSetAtom(inboxOpenAtom);
  const setPendingJump = useSetAtom(pendingEventJumpAtom);
  const setWhatsNewOpen = useSetAtom(whatsNewOpenAtom);
  const { status: verification } = useAtomValue(sessionVerificationAtom);
  const myId = client.userId();
  const { data: profile } = useProfile(myId);
  const joinVoiceRoom = useJoinVoiceRoom(client);
  const entries = useRoomEntries();
  const spaces = useAllJoinedSpaces();
  const graph = useSpaceGraph();

  const invites = useInvites();
  const { mentions } = useMentions(true);
  const friends = useFriendActivities(client);

  const name = profile?.displayName || undefined;
  const greeting = name ? t('timeline.home.greeting', { name }) : t('timeline.welcomeTitle');

  const openSettings = (page: SettingsPage) => {
    setSettingsPage(page);
    setSettingsOpen(true);
  };

  // ---------- data ----------

  const recent = useMemo(
    () =>
      entries
        .filter((e) => e.kind !== 'space' && e.lastActiveTs > 0)
        .sort((a, b) => b.lastActiveTs - a.lastActiveTs)
        .slice(0, RECENT_ROOMS),
    [entries]
  );
  const hasRooms = entries.length > 0;

  const live = useActiveVoiceCards(client);

  const whatsNew = useMemo(() => latestWhatsNew(i18n.language), [i18n.language]);
  const highlights = useMemo(() => (whatsNew ? noteHighlights(whatsNew.markdown) : []), [whatsNew]);

  const shownInvites = invites.slice(0, CATCH_UP_INVITES);
  const shownMentions = mentions.slice(0, CATCH_UP_MENTIONS);
  const hasCatchUp = shownInvites.length + shownMentions.length > 0;

  const spaceNameOf = (roomId: string) => {
    const parentId = parentSpacesOf(graph, roomId)[0];
    return parentId ? (spaces.find((s) => s.id === parentId)?.name ?? null) : null;
  };

  const openMention = (mention: Mention) => {
    if (mention.eventId) setPendingJump({ roomId: mention.roomId, eventId: mention.eventId });
    navigate(roomPath(mention.kind, mention.roomId));
  };

  const inviteLine = (invite: Invite) =>
    invite.inviterDisplayName || invite.inviterUserId
      ? t('timeline.home.invitedBy', {
          name: invite.inviterDisplayName ?? formatUserId(invite.inviterUserId),
        })
      : t('timeline.home.invitation');

  const roomSubtitle = (entry: RoomEntry) => {
    if (entry.kind === 'dm') return t('timeline.home.dmLabel');
    const space = spaceNameOf(entry.roomId);
    const label = entry.isVoice ? t('timeline.home.voiceLabel') : t('timeline.home.roomLabel');
    return space ? `${label} · ${space}` : label;
  };

  // ---------- quick actions and setup ----------

  const start: Action[] = [
    {
      id: 'dm',
      icon: <ChatCircleIcon size={22} />,
      title: t('timeline.startDm'),
      description: t('timeline.home.dmDesc'),
      onClick: () => setNewDmOpen(true),
    },
    {
      id: 'space',
      icon: <StackIcon size={22} />,
      title: t('room.space.chooseCreateJoin'),
      description: t('timeline.home.spaceDesc'),
      onClick: () => setCreateSpaceOpen({ open: true }),
    },
    {
      id: 'explore',
      icon: <CompassIcon size={22} />,
      title: t('timeline.home.exploreTitle'),
      description: t('timeline.home.exploreDesc'),
      onClick: () => setExploreOpen(true),
    },
  ];

  const setup: Action[] = [];
  if (profile && !profile.avatarUrl) {
    setup.push({
      id: 'profile',
      icon: <CameraIcon size={20} />,
      title: t('timeline.home.profileTitle'),
      description: t('timeline.home.profileDesc'),
      onClick: () => openSettings('account'),
    });
  }
  if (verification === 'no-identity' || verification === 'unverified') {
    const notSetUp = verification === 'no-identity';
    setup.push({
      id: 'encryption',
      icon: notSetUp ? <LockKeyIcon size={20} /> : <ShieldWarningIcon size={20} />,
      title: notSetUp ? t('verifySession.setupButton') : t('verifySession.title'),
      description: t('timeline.home.encryptionDesc'),
      onClick: () => openSettings(notSetUp ? 'encryption' : 'sessions'),
      warning: true,
    });
  }

  // Each block that shows takes the next place in the entrance.
  let place = 2;
  const next = () => place++;

  const catchUpIndex = hasCatchUp ? next() : 0;
  const recentIndex = recent.length > 0 ? next() : 0;
  const liveIndex = live.length > 0 ? next() : 0;
  const friendsIndex = friends.length > 0 ? next() : 0;
  const whatsNewIndex = whatsNew ? next() : 0;
  const quickIndex = next();

  const startGrid = (
    <section className={css.section} aria-labelledby="home-start-heading">
      <h2
        id="home-start-heading"
        className={`${css.sectionLabel} ${css.enter}`}
        style={step(quickIndex)}
      >
        {t('timeline.home.startHeading')}
      </h2>
      <ul className={css.grid}>
        {start.map((action, i) => (
          <li
            key={action.id}
            className={`${css.gridItem} ${css.enter}`}
            style={step(quickIndex + 1 + i)}
          >
            <button type="button" className={css.card} onClick={action.onClick}>
              <span className={css.cardIcon} aria-hidden>
                {action.icon}
              </span>
              <span className={css.cardText}>
                <span className={css.cardTitle}>{action.title}</span>
                <span className={css.cardDesc}>{action.description}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );

  return (
    <div className={css.home}>
      <div className={css.inner}>
        <header className={`${css.hero} ${css.enter}`} style={step(0)}>
          <div className={css.logo} aria-hidden>
            <LogoHover size={56} />
          </div>
          <div className={css.heroText}>
            <h1 className={css.title}>{greeting}</h1>
            <p className={css.tagline}>{t('welcome.tagline')}</p>
          </div>
        </header>

        {setup.length > 0 && (
          <section className={css.section} aria-labelledby="home-setup-heading">
            <h2
              id="home-setup-heading"
              className={`${css.sectionLabel} ${css.enter}`}
              style={step(1)}
            >
              {t('timeline.home.setupHeading')}
            </h2>
            <ul className={`${css.setupList} ${css.enter}`} style={step(1)}>
              {setup.map((action) => (
                <li key={action.id}>
                  <button type="button" className={css.setupRow} onClick={action.onClick}>
                    <span
                      className={`${css.setupIcon}${action.warning ? ` ${css.setupIconWarning}` : ''}`}
                      aria-hidden
                    >
                      {action.icon}
                    </span>
                    <span className={css.setupText}>
                      <span className={css.cardTitle}>{action.title}</span>
                      <span className={css.cardDesc}>{action.description}</span>
                    </span>
                    <CaretRightIcon size={16} className={css.chevron} aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        {!hasRooms && startGrid}

        <div className={css.columns}>
          <div className={css.column}>
            {hasCatchUp && (
              <Panel
                id="home-catchup-heading"
                index={catchUpIndex}
                icon={<BellRingingIcon size={16} weight="fill" />}
                title={t('timeline.home.catchUpHeading')}
                action={
                  <button
                    type="button"
                    className={css.panelAction}
                    onClick={() => setInboxOpen(true)}
                  >
                    {t('timeline.home.inboxLink')}
                  </button>
                }
              >
                <ul className={css.rows}>
                  {shownInvites.map((invite) => (
                    <li key={invite.roomId}>
                      <button type="button" className={css.row} onClick={() => setInboxOpen(true)}>
                        <Avatar
                          name={invite.name}
                          mxcUrl={invite.avatarMxc}
                          client={client}
                          size="md"
                        />
                        <span className={css.rowText}>
                          <span className={css.rowTitle}>{invite.name}</span>
                          <span className={css.rowSub}>{inviteLine(invite)}</span>
                        </span>
                        <span className={css.rowTag}>
                          <EnvelopeSimpleIcon size={14} weight="fill" aria-hidden />
                          {invite.ts ? relativeTime(t, i18n.language, invite.ts) : null}
                        </span>
                      </button>
                    </li>
                  ))}
                  {shownMentions.map((mention) => (
                    <li key={mention.eventId || `${mention.roomId}:${mention.ts}`}>
                      <button
                        type="button"
                        className={css.row}
                        onClick={() => openMention(mention)}
                      >
                        <Avatar
                          name={mention.roomName}
                          mxcUrl={mention.roomAvatarMxc}
                          client={client}
                          size="md"
                        />
                        <span className={css.rowText}>
                          <span className={css.rowTitle}>{mention.roomName}</span>
                          <span className={css.rowSub}>
                            {t('timeline.home.mentionedYou', { name: mention.senderName })}
                          </span>
                        </span>
                        <span className={css.rowTag}>
                          {relativeTime(t, i18n.language, mention.ts)}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </Panel>
            )}

            {recent.length > 0 && (
              <section
                className={`${css.section} ${css.enter}`}
                style={step(recentIndex)}
                aria-labelledby="home-recent-heading"
              >
                <h2 id="home-recent-heading" className={css.sectionLabel}>
                  <ClockCounterClockwiseIcon size={14} aria-hidden />{' '}
                  {t('timeline.home.recentHeading')}
                </h2>
                <ul className={css.roomGrid}>
                  {recent.map((entry) => (
                    <li key={entry.roomId} className={css.gridItem}>
                      <button
                        type="button"
                        className={css.roomCard}
                        onClick={() => navigate(roomPath(entry.kind, entry.roomId))}
                      >
                        <Avatar
                          name={entry.name}
                          mxcUrl={entry.avatarMxc}
                          client={client}
                          size="md"
                        />
                        <span className={css.rowText}>
                          <span className={css.rowTitle}>
                            {entry.isVoice && (
                              <SpeakerHighIcon size={13} weight="fill" className={css.inlineIcon} />
                            )}
                            {entry.name}
                          </span>
                          <span className={css.rowSub}>{roomSubtitle(entry)}</span>
                        </span>
                        {entry.unread > 0 && (
                          <span
                            className={entry.highlight ? css.badgeMention : css.badge}
                            aria-label={t('timeline.home.unreadBadge', { count: entry.unread })}
                          >
                            {entry.unread > 99 ? '99+' : entry.unread}
                          </span>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {hasRooms && (
              <section
                className={`${css.section} ${css.enter}`}
                style={step(quickIndex)}
                aria-labelledby="home-quick-heading"
              >
                <h2 id="home-quick-heading" className={css.sectionLabel}>
                  {t('timeline.home.startHeading')}
                </h2>
                <ul className={css.chips}>
                  {start.map((action) => (
                    <li key={action.id}>
                      <button type="button" className={css.chip} onClick={action.onClick}>
                        {action.icon}
                        {action.title}
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>

          <div className={css.column}>
            {live.length > 0 && (
              <Panel
                id="home-live-heading"
                index={liveIndex}
                icon={<SpeakerHighIcon size={16} weight="fill" />}
                title={t('timeline.home.liveHeading')}
                className={css.liveOnlyNarrow}
              >
                <ul className={css.rows}>
                  {live.slice(0, LIVE_ROOMS).map((room) => (
                    <li key={room.roomId} className={css.liveRow}>
                      <span className={css.rowText}>
                        <span className={css.rowTitle}>{room.roomName}</span>
                        <span className={css.rowSub}>
                          {[
                            t('timeline.home.inCall', { count: room.people.length }),
                            room.spaceName,
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </span>
                        <span className={css.avatarStack}>
                          {room.people.slice(0, LIVE_AVATARS).map((person) => (
                            <span key={person.userId} className={css.stackItem}>
                              <PersonAvatar person={person} client={client} size="sm" />
                            </span>
                          ))}
                          {room.people.length > LIVE_AVATARS && (
                            <span className={css.stackMore}>
                              +{room.people.length - LIVE_AVATARS}
                            </span>
                          )}
                        </span>
                      </span>
                      <Button
                        size="sm"
                        variant={room.includesMe ? 'secondary' : 'primary'}
                        onClick={() => {
                          if (room.includesMe) navigate(roomPath('room', room.roomId));
                          else void joinVoiceRoom(room.roomId);
                        }}
                      >
                        {room.includesMe ? t('home.open') : t('home.join')}
                      </Button>
                    </li>
                  ))}
                </ul>
              </Panel>
            )}

            {friends.length > 0 && (
              <Panel
                id="home-friends-heading"
                index={friendsIndex}
                icon={<GameControllerIcon size={16} weight="fill" />}
                title={t('timeline.home.friendsHeading')}
              >
                <ul className={css.rows}>
                  {friends.slice(0, FRIENDS_SHOWN).map((friend) => (
                    <li key={friend.userId}>
                      <button
                        type="button"
                        className={css.row}
                        onClick={() => navigate(roomPath('dm', friend.roomId))}
                      >
                        <Avatar
                          name={friend.name}
                          mxcUrl={friend.avatarMxc}
                          client={client}
                          size="md"
                        />
                        <span className={css.rowText}>
                          <span className={css.rowTitle}>{friend.name}</span>
                          {friend.activities.map((activity) => (
                            <span key={`${activity.type}:${activity.name}`} className={css.rowSub}>
                              {ACTIVITY_EMOJI[activity.type]} {activityText(t, activity)}
                            </span>
                          ))}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </Panel>
            )}

            {whatsNew && (
              <Panel
                id="home-whatsnew-heading"
                index={whatsNewIndex}
                icon={<SparkleIcon size={16} weight="fill" />}
                title={t('timeline.home.whatsNewHeading')}
                className={css.whatsNew}
                action={<span className={css.versionPill}>{whatsNew.version}</span>}
              >
                {highlights.length > 0 && (
                  <ul className={css.notes}>
                    {highlights.map((note) => (
                      <li key={note} className={css.note}>
                        {note}
                      </li>
                    ))}
                  </ul>
                )}
                <Button size="sm" variant="secondary" onClick={() => setWhatsNewOpen(true)}>
                  {t('timeline.home.readAll')}
                </Button>
              </Panel>
            )}
          </div>
        </div>

        <p className={`${css.hint} ${css.enter}`} style={step(place + 4)}>
          <Trans
            i18nKey="timeline.home.searchHint"
            values={{ keys: `${MODIFIER_KEY} K` }}
            components={{ kbd: <kbd className={css.kbd} /> }}
          />
        </p>
      </div>
    </div>
  );
}
