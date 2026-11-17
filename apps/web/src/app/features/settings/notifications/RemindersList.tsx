import { useTranslation } from 'react-i18next';
import { useAtomValue } from 'jotai';
import { XIcon } from '@phosphor-icons/react';
import { getMatrixClientOrNull } from '@/client/initMatrix';
import { useAllRooms } from '@/app/data';
import { useToast } from '@/app/hooks/useToast';
import { formatUserId } from '@/util/matrix';
import { getErrorMessage } from '@/util/error';
import { formatReminderTime, remindersAtom, removeReminder } from '@/util/reminders';
import * as layoutCss from '../Settings.css';
import * as css from './Notifications.css';

/** The reminders set with "Remind me" on messages that have not gone off yet. */
export function RemindersList() {
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const client = getMatrixClientOrNull();
  const reminders = useAtomValue(remindersAtom);
  const rooms = useAllRooms();

  const roomLabel = (roomId: string): string => {
    const room = rooms.find((r) => r.id === roomId);
    if (!room) return roomId;
    if (room.isDirect && room.dmUserId) return room.dmUserName ?? formatUserId(room.dmUserId);
    return room.name ?? roomId;
  };

  return (
    <div className={layoutCss.section}>
      <h3 className={layoutCss.sectionTitle}>{t('settings.notifications.reminders.title')}</h3>
      {reminders.length === 0 ? (
        <p className={`${layoutCss.settingNote} ${css.keywordEmpty}`}>
          {t('settings.notifications.reminders.empty')}
        </p>
      ) : (
        <ul className={css.keywordList}>
          {reminders.map((reminder) => (
            <li key={reminder.id} className={css.keywordItem}>
              <span className={css.keywordText}>
                {t('settings.notifications.reminders.entry', {
                  room: roomLabel(reminder.roomId),
                  time: formatReminderTime(reminder.at, i18n.language),
                })}
              </span>
              <button
                type="button"
                className={css.keywordDel}
                onClick={() => {
                  if (!client) return;
                  removeReminder(client, reminder.id).catch((err) =>
                    toast.error(t('timeline.remind.failed', { error: getErrorMessage(err) }))
                  );
                }}
                aria-label={t('settings.notifications.reminders.cancel')}
              >
                <XIcon size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
