import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { WizardClient as MatrixClient } from '@wizardchat/core';
import { useAccountData } from '@/app/data';
import { legacyMudrixKey, mudrixKey } from '@/util/namespace';

/**
 * Private per-user notes, Discord-style: text only you can see, kept in account data (not a room
 * event) so it follows your account across devices and is never sent to the person it is about.
 */
const USER_NOTES_ACCOUNT_DATA = mudrixKey('user_notes');
const LEGACY_USER_NOTES_ACCOUNT_DATA = legacyMudrixKey('user_notes');
const MAX_NOTE_LENGTH = 1000;
const SAVE_DEBOUNCE_MS = 600;

function parseNotes(content: unknown): Record<string, string> {
  if (!content || typeof content !== 'object') return {};
  const notes = (content as Record<string, unknown>).notes;
  if (!notes || typeof notes !== 'object') return {};
  const out: Record<string, string> = {};
  for (const [userId, value] of Object.entries(notes as Record<string, unknown>)) {
    if (typeof value === 'string' && value) out[userId] = value.slice(0, MAX_NOTE_LENGTH);
  }
  return out;
}

export function useUserNotes(client: MatrixClient | null | undefined): {
  getNote: (userId: string) => string;
  saveNote: (userId: string, note: string) => void;
} {
  const current = useAccountData(USER_NOTES_ACCOUNT_DATA);
  const legacy = useAccountData(LEGACY_USER_NOTES_ACCOUNT_DATA);
  // The current name wins when both exist; an older device may still write the legacy one.
  const remote = useMemo(() => parseNotes(current ?? legacy), [current, legacy]);
  const [notes, setNotes] = useState<Record<string, string>>(remote);
  const latestRef = useRef<Record<string, string>>(remote);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    latestRef.current = remote;
    setNotes(remote);
  }, [remote]);

  useEffect(
    () => () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    },
    []
  );

  const getNote = useCallback((userId: string) => notes[userId] ?? '', [notes]);

  const saveNote = useCallback(
    (userId: string, note: string) => {
      if (!client) return;
      const trimmed = note.slice(0, MAX_NOTE_LENGTH);
      const next = { ...latestRef.current };
      if (trimmed) next[userId] = trimmed;
      else delete next[userId];
      latestRef.current = next;
      setNotes(next);

      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        client
          .setAccountData(USER_NOTES_ACCOUNT_DATA, { notes: latestRef.current })
          .catch(() => {});
      }, SAVE_DEBOUNCE_MS);
    },
    [client]
  );

  return { getNote, saveNote };
}
