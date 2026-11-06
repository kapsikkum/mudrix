import { useEffect, useRef } from 'react';
import { useAtomValue } from 'jotai';
import { useTranslation } from 'react-i18next';
import type { WizardClient } from '@wizardchat/core';
import { roomsByIdAtom, spaceGraphAtom } from '@/app/data';
import { useToast } from '@/app/hooks/useToast';
import { allowVoiceMovesAtom } from '@/app/store/atoms/settings';
import { callUiAtom } from '@/app/store/atoms/call';
import { playSoundKind } from '@/util/notificationSounds';
import { isVoiceRoom } from '@/util/matrix';
import { typeAndLegacy } from '@/util/namespace';
import { VOICE_MOVE_EVENT_TYPE, mayMoveBetween, type VoiceMoveContent } from './voiceMove';

/** Requests older than this are ignored, so a move is never replayed after a reload. */
const MAX_AGE_MS = 60_000;
/** How far ahead of this device's clock a request may be dated before it is ignored. */
const MAX_CLOCK_SKEW_MS = 30_000;
const MAX_REMEMBERED = 200;

/**
 * Follows a request from someone who manages the space to join another voice channel. Only acts when
 * this person is in that call, the sender manages a space containing both channels, and the setting
 * is on.
 */
export function useVoiceMoves(
  client: WizardClient | null,
  join: (roomId: string, opts?: { skipConfirm?: boolean }) => Promise<void>,
  myUserId: string
): void {
  const { t } = useTranslation();
  const toast = useToast();
  const allowed = useAtomValue(allowVoiceMovesAtom);
  const callRoomId = useAtomValue(callUiAtom).roomId;
  const roomsById = useAtomValue(roomsByIdAtom);
  const graph = useAtomValue(spaceGraphAtom);
  const seen = useRef(new Set<string>());

  // The watcher lives as long as the client; what it needs to know is read when a request arrives.
  const latest = useRef({ allowed, callRoomId, roomsById, graph, join, t, toast });
  latest.current = { allowed, callRoomId, roomsById, graph, join, t, toast };

  useEffect(() => {
    if (!client || !myUserId) return undefined;
    const subscription = client.watchRoomEvents(
      [...typeAndLegacy(VOICE_MOVE_EVENT_TYPE)],
      ({ roomId, sender, eventId, content, originServerTs }) => {
        const now = latest.current;
        const request = (content ?? {}) as Partial<VoiceMoveContent>;
        // One move arrives under both type names; it is acted on once.
        const key = typeof request.move_id === 'string' ? `m:${request.move_id}` : eventId;
        if (seen.current.has(key)) return;
        seen.current.add(key);
        if (seen.current.size > MAX_REMEMBERED) {
          seen.current.delete(seen.current.values().next().value as string);
        }

        if (request.user_id !== myUserId || typeof request.to_room_id !== 'string') return;
        // Neither stale nor dated in the future: a forged far-future timestamp would otherwise
        // outlive the freshness window.
        const age = Date.now() - originServerTs;
        if (originServerTs === 0 || age > MAX_AGE_MS || age < -MAX_CLOCK_SKEW_MS) return;
        if (!now.allowed || now.callRoomId !== roomId) return;

        const target = now.roomsById.get(request.to_room_id);
        if (!target || target.isInvite || !isVoiceRoom(target)) return;

        const targetId = request.to_room_id;
        void mayMoveBetween(client, now.graph, sender, roomId, targetId)
          .then((ok) => {
            if (!ok || latest.current.callRoomId !== roomId) return;
            client
              .members(roomId)
              .catch(() => [])
              .then((members) => {
                const by = members.find((m) => m.userId === sender)?.displayName ?? sender;
                latest.current.toast.info(
                  latest.current.t('voice.movedBy', { room: target.name, name: by })
                );
                playSoundKind('moved');
                void latest.current.join(targetId, { skipConfirm: true });
              });
          })
          .catch(() => {});
      }
    );
    return () => subscription.cancel();
  }, [client, myUserId]);
}
