import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ChatsIcon,
  GearSixIcon,
  ShieldIcon,
  UserIcon,
  type Icon as PhosphorIcon,
} from '@phosphor-icons/react';
import { useAllJoinedSpaces, useAllRooms, useClient, useTimeline } from '@/app/data';
import { Button } from '@/app/components/Button';
import {
  AUDIT_CATEGORIES,
  buildAuditLog,
  levelValue,
  type AuditCategory,
  type AuditEntry,
} from './auditEntries';
import * as layoutCss from '@/app/components/Settings/Settings.css';
import * as css from './AuditLog.css';

const ICONS: Record<AuditCategory, PhosphorIcon> = {
  members: UserIcon,
  permissions: ShieldIcon,
  settings: GearSixIcon,
  rooms: ChatsIcon,
};

/** Enough entries to fill the panel before the user asks for more. */
const WANT = 30;
const MAX_AUTO_PAGES = 8;

/** Who changed what in this room (members, permissions, settings and, for a space, its rooms). */
export function AuditLogPanel({ roomId }: { roomId: string }) {
  const { t, i18n } = useTranslation();
  const client = useClient();
  const rooms = useAllRooms();
  const spaces = useAllJoinedSpaces();
  const [filter, setFilter] = useState<AuditCategory | 'all'>('all');
  const { entries: raw, atStart, loading, loadOlder } = useTimeline(client, roomId);

  const names = useMemo(
    () =>
      new Map<string, string>([
        ...rooms.map((r) => [r.id, r.name ?? r.id] as const),
        ...spaces.map((s) => [s.id, s.name] as const),
      ]),
    [rooms, spaces]
  );
  const entries = useMemo(() => buildAuditLog(raw, (id) => names.get(id) ?? id), [raw, names]);
  const shown = filter === 'all' ? entries : entries.filter((e) => e.category === filter);

  // Fill the panel when it opens: most of a busy room's timeline is messages, so look further back
  // a few pages at a time until there is enough to show.
  const autoPages = useRef(0);
  useEffect(() => {
    autoPages.current = 0;
  }, [roomId]);
  useEffect(() => {
    if (loading || atStart || entries.length >= WANT || raw.length === 0) return;
    if (autoPages.current >= MAX_AUTO_PAGES) return;
    autoPages.current += 1;
    void loadOlder();
  }, [loading, atStart, entries.length, raw.length, loadOlder]);

  const describe = (entry: AuditEntry): string => {
    const values: Record<string, string> = { ...entry.values };
    if (entry.action === 'powerChanged') {
      const label = (value: string) => {
        const { key, level } = levelValue(Number(value));
        return key ? `${t(`room.settings.members.${key}`)} (${level})` : level;
      };
      values.from = label(values.from);
      values.to = label(values.to);
    }
    if (entry.action === 'joinRulesChanged') {
      values.rule = t(`room.settings.auditLog.rule.${values.rule}`, { defaultValue: values.rule });
    }
    return t(`room.settings.auditLog.action.${entry.action}`, values);
  };

  const formatter = new Intl.DateTimeFormat(i18n.language, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  return (
    <div>
      <h2 className={layoutCss.panelTitle}>{t('room.settings.auditLog.title')}</h2>
      <p className={layoutCss.settingNote}>{t('room.settings.auditLog.note')}</p>

      <div className={css.filters} role="group" aria-label={t('room.settings.auditLog.filter')}>
        {(['all', ...AUDIT_CATEGORIES] as const).map((category) => (
          <button
            key={category}
            type="button"
            className={filter === category ? css.chipActive : css.chip}
            aria-pressed={filter === category}
            onClick={() => setFilter(category)}
          >
            {t(`room.settings.auditLog.category.${category}`)}
          </button>
        ))}
      </div>

      {shown.length > 0 ? (
        <ul className={css.list} style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {shown.map((entry) => {
            const Icon = ICONS[entry.category];
            return (
              <li key={entry.id} className={css.row}>
                <Icon size={16} className={css.icon} aria-hidden />
                <span className={css.text}>
                  <span className={css.actor}>{entry.actor}</span> {describe(entry)}
                </span>
                <span className={css.time}>{formatter.format(entry.ts)}</span>
              </li>
            );
          })}
        </ul>
      ) : (
        !loading && <p className={css.footer}>{t('room.settings.auditLog.empty')}</p>
      )}

      <div className={css.footer}>
        {loading ? (
          t('room.settings.auditLog.loading')
        ) : !atStart ? (
          <Button variant="secondary" size="sm" onClick={() => void loadOlder()}>
            {t('room.settings.auditLog.loadOlder')}
          </Button>
        ) : (
          shown.length > 0 && t('room.settings.auditLog.start')
        )}
      </div>
    </div>
  );
}
