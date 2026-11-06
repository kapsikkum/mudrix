import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { ACTIVITY_EMOJI, type ProfileActivity } from '@/util/profileActivity';
import * as css from './ActivityCards.css';

const MINUTE_MS = 60_000;

/** "2 hours 5 minutes" in the viewer's language, or "" under a minute. */
function formatElapsed(ms: number, language: string): string {
  const minutes = Math.floor(ms / MINUTE_MS);
  if (minutes < 1) return '';
  const unit = (value: number, name: 'day' | 'hour' | 'minute') =>
    new Intl.NumberFormat(language, { style: 'unit', unit: name, unitDisplay: 'long' }).format(
      value
    );
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const rest = minutes % 60;
  if (days > 0) return [unit(days, 'day'), hours > 0 ? unit(hours, 'hour') : ''].join(' ').trim();
  if (hours > 0)
    return [unit(hours, 'hour'), rest > 0 ? unit(rest, 'minute') : ''].join(' ').trim();
  return unit(rest, 'minute');
}

/** How long a game has been going. A track's start is only when it was first seen, so it has none. */
function elapsedLine(
  t: TFunction,
  language: string,
  activity: ProfileActivity,
  now: number
): string | null {
  if (activity.type !== 'playing' || !activity.startedAt) return null;
  const elapsed = formatElapsed(Math.max(0, now - activity.startedAt), language);
  return elapsed
    ? t('profile.activity.forDuration', { duration: elapsed })
    : t('profile.activity.justStarted');
}

function ActivityCard({ activity }: { activity: ProfileActivity }) {
  const { t, i18n } = useTranslation();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (activity.type !== 'playing') return undefined;
    const id = window.setInterval(() => setNow(Date.now()), MINUTE_MS / 2);
    return () => window.clearInterval(id);
  }, [activity.type]);

  const elapsed = elapsedLine(t, i18n.language, activity, now);
  return (
    <div className={css.card}>
      <span className={css.heading}>
        {t(
          activity.type === 'playing'
            ? 'profile.activity.cardPlaying'
            : 'profile.activity.cardListening'
        )}
      </span>
      <div className={css.body}>
        <span className={css.icon} aria-hidden>
          {ACTIVITY_EMOJI[activity.type]}
        </span>
        <span className={css.text}>
          <span className={css.title}>{activity.name}</span>
          {activity.details && (
            <span className={css.detail}>
              {t('profile.activity.by', { artist: activity.details })}
            </span>
          )}
          {elapsed && <span className={css.meta}>{elapsed}</span>}
        </span>
      </div>
    </div>
  );
}

/** What someone is playing and listening to, in full (the member list can only show a line). */
export function ActivityCards({ activities }: { activities: ProfileActivity[] }) {
  if (activities.length === 0) return null;
  return (
    <div className={css.cards}>
      {activities.map((activity) => (
        <ActivityCard key={`${activity.type}:${activity.name}`} activity={activity} />
      ))}
    </div>
  );
}
