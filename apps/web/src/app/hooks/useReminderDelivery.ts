import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAtomValue, useSetAtom } from 'jotai';
import { useTranslation } from 'react-i18next';
import type { WizardClient } from '@wizardchat/core';
import { useAllRooms } from '@/app/data';
import { pendingEventJumpAtom } from '@/app/store/atoms';
import { useSyncReady } from '@/app/hooks/useSync';
import { useToast } from '@/app/hooks/useToast';
import { useFirstAccountData } from '@/app/hooks/useFirstAccountData';
import { showBrowserNotification } from '@/app/hooks/useNotifications';
import { stripReplyFallback } from '@/app/features/timeline/message/textContent';
import { formatUserId } from '@/util/matrix';
import { resolveSavedEvent } from '@/util/savedMessages';
import {
  REMINDER_TYPES,
  parseReminders,
  remindersAtom,
  removeReminder,
  type Reminder,
} from '@/util/reminders';

const MAX_TIMEOUT_MS = 2 ** 31 - 1;
const TOAST_MS = 20_000;

/**
 * Delivers "Remind me" reminders when they fall due: a notification (when the window is in the
 * background), a toast that jumps to the message, and the reminder is removed so that no other
 * device repeats it. Reminders that came due while the app was closed are delivered at start-up.
 * It also keeps `remindersAtom` (the list in Settings > Notifications) current; mount it once.
 */
export function useReminderDelivery(client: WizardClient | null): void {
  const { t } = useTranslation();
  const toast = useToast();
  const navigate = useNavigate();
  const setPendingJump = useSetAtom(pendingEventJumpAtom);
  const syncReady = useSyncReady();
  const rooms = useAllRooms();
  const roomsRef = useRef(rooms);
  roomsRef.current = rooms;

  const content = useFirstAccountData(client, REMINDER_TYPES);
  const setReminders = useSetAtom(remindersAtom);
  const reminders = useAtomValue(remindersAtom);
  useEffect(() => setReminders(parseReminders(content)), [content, setReminders]);

  const delivering = useRef(new Set<string>());
  // Re-runs the effect when a timer that was cut short (very distant reminder) fires early.
  const [tick, setTick] = useState(0);

  const deliver = useCallback(
    async (reminder: Reminder) => {
      if (!client || delivering.current.has(reminder.id)) return;
      delivering.current.add(reminder.id);
      try {
        // Whoever removes it first delivers it; a device that finds it gone stays quiet.
        if (!(await removeReminder(client, reminder.id))) return;
      } catch {
        // Offline: try again on the next change or start-up.
        delivering.current.delete(reminder.id);
        return;
      }

      const room = roomsRef.current.find((r) => r.id === reminder.roomId);
      const direct = !!room?.isDirect && !!room.dmUserId;
      const roomName = room
        ? direct
          ? (room.dmUserName ?? formatUserId(room.dmUserId))
          : (room.name ?? reminder.roomId)
        : reminder.roomId;
      const preview = await resolveSavedEvent(client, reminder);
      const text =
        preview && !preview.redacted
          ? stripReplyFallback(preview.body).split('\n')[0].trim().slice(0, 140)
          : '';
      const summary = text ? `${roomName}: ${text}` : roomName;

      const route = `${direct ? '/dm/' : '/r/'}${encodeURIComponent(reminder.roomId)}`;
      const open = () => {
        setPendingJump({ roomId: reminder.roomId, eventId: reminder.eventId });
        navigate(route);
      };
      toast.info(`${t('reminders.title')}: ${summary}`, {
        duration: TOAST_MS,
        actionLabel: t('reminders.open'),
        onClick: open,
      });
      if (document.hidden || !document.hasFocus()) {
        void showBrowserNotification(t('reminders.title'), summary, route);
      }
    },
    [client, navigate, setPendingJump, t, toast]
  );

  useEffect(() => {
    if (!client || !syncReady || reminders.length === 0) return undefined;
    const now = Date.now();
    reminders.filter((r) => r.at <= now).forEach((r) => void deliver(r));
    const next = reminders.find((r) => r.at > now);
    if (!next) return undefined;
    const timer = setTimeout(
      () => {
        if (Date.now() >= next.at - 1000) void deliver(next);
        else setTick((n) => n + 1);
      },
      Math.min(next.at - now, MAX_TIMEOUT_MS)
    );
    return () => clearTimeout(timer);
  }, [client, syncReady, reminders, deliver, tick]);
}
