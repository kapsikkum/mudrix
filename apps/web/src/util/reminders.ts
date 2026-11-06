import { atom } from 'jotai';
import type { WizardClient } from '@wizardchat/core';
import { formatTime } from '@/util/format';
import { legacyMudrixKey, mudrixKey } from '@/util/namespace';
import { readFirstAccountData } from '@/app/hooks/useFirstAccountData';

// "Remind me" reminders live in account data, so they follow the account to every device. Like
// saved messages they store only room and event ids: the server never sees message text. They
// are delivered by a timer in an open client (there is no server-side scheduling), see
// `useReminderDelivery`.
const REMINDERS_TYPE = mudrixKey('reminders');
export const REMINDER_TYPES = [REMINDERS_TYPE, legacyMudrixKey('reminders')] as const;

export interface Reminder {
  id: string;
  roomId: string;
  eventId: string;
  /** Epoch ms when it is due. */
  at: number;
}

/** The pending reminders, soonest first, kept current by `useReminderDelivery`. */
export const remindersAtom = atom<Reminder[]>([]);

export function parseReminders(content: unknown): Reminder[] {
  const items = (content as { items?: unknown } | null)?.items;
  if (!Array.isArray(items)) return [];
  return items
    .flatMap((item): Reminder[] => {
      const { id, roomId, eventId, at } = (item ?? {}) as Partial<Reminder>;
      if (typeof id !== 'string' || typeof roomId !== 'string') return [];
      if (typeof eventId !== 'string' || typeof at !== 'number') return [];
      return [{ id, roomId, eventId, at }];
    })
    .sort((a, b) => a.at - b.at);
}

async function currentReminders(client: WizardClient): Promise<Reminder[]> {
  return parseReminders(await readFirstAccountData(client, REMINDER_TYPES));
}

export async function addReminder(
  client: WizardClient,
  roomId: string,
  eventId: string,
  at: number
): Promise<Reminder> {
  const reminder: Reminder = {
    id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`,
    roomId,
    eventId,
    at,
  };
  await client.setAccountData(REMINDERS_TYPE, {
    items: [...(await currentReminders(client)), reminder],
  });
  return reminder;
}

/** Removes a reminder; false when it was already gone (another device delivered or cancelled it). */
export async function removeReminder(client: WizardClient, id: string): Promise<boolean> {
  const current = await currentReminders(client);
  if (!current.some((r) => r.id === id)) return false;
  await client.setAccountData(REMINDERS_TYPE, { items: current.filter((r) => r.id !== id) });
  return true;
}

export type ReminderPreset = 'in20m' | 'in1h' | 'in3h' | 'tomorrow';

export const REMINDER_PRESETS: ReminderPreset[] = ['in20m', 'in1h', 'in3h', 'tomorrow'];

/** When a preset falls due, relative to `now`. "Tomorrow" is 9:00 the next morning, local time. */
export function reminderTime(preset: ReminderPreset, now: number = Date.now()): number {
  switch (preset) {
    case 'in20m':
      return now + 20 * 60_000;
    case 'in1h':
      return now + 60 * 60_000;
    case 'in3h':
      return now + 3 * 60 * 60_000;
    default: {
      const next = new Date(now);
      next.setDate(next.getDate() + 1);
      next.setHours(9, 0, 0, 0);
      return next.getTime();
    }
  }
}

/** "15:40", or "Tue 15:40" when it is not today (follows the time format preference). */
export function formatReminderTime(at: number, locale: string, now: number = Date.now()): string {
  const time = formatTime(at, locale);
  if (new Date(now).toDateString() === new Date(at).toDateString()) return time;
  const day = new Intl.DateTimeFormat(locale, { weekday: 'short' }).format(at);
  return `${day} ${time}`;
}
