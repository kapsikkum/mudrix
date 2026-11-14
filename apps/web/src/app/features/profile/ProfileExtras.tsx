import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { useSetAtom } from 'jotai';
import {
  CalendarBlankIcon,
  ChatTeardropTextIcon,
  ClockCounterClockwiseIcon,
  DevicesIcon,
  NotePencilIcon,
  SealCheckIcon,
  ShieldIcon,
} from '@phosphor-icons/react';
import type { WizardClient as MatrixClient } from '@wizardchat/core';
import { Modal } from '@/app/components/Modal';
import { Tooltip } from '@/app/components/Tooltip';
import { linkifyParts, localTimeIn } from '@/util/profileFields';
import { formatRelativeTime } from '@/util/format';
import { getErrorMessage } from '@/util/error';
import { useToast } from '@/app/hooks/useToast';
import { useUserNotes } from '@/app/hooks/useUserNotes';
import { useUserVerification } from '@/app/hooks/useUserVerification';
import { useUserDeviceSummary } from '@/app/hooks/useUserDeviceSummary';
import { startUserVerification } from '@/app/features/device/sessionVerification';
import { emojiVerificationAtom } from '@/app/store/atoms';
import { isTouchDevice } from '@/util/touch';
import { useMemberSince } from './memberSince';
import * as css from './UserProfilePopup.css';
import * as cardCss from './ProfileCard.css';

/**
 * Renders untrusted text as plain text with http(s) URLs turned into links. No HTML is ever
 * interpreted: every part is a React text node or an anchor built from a parsed URL.
 */
export function LinkifiedText({ text, linkClassName }: { text: string; linkClassName?: string }) {
  const parts = useMemo(() => linkifyParts(text), [text]);
  return (
    <>
      {parts.map((part, i) =>
        part.type === 'link' ? (
          <a
            key={i}
            href={part.href}
            target="_blank"
            rel="noopener noreferrer nofollow ugc"
            className={linkClassName ?? css.bioLink}
          >
            {part.text}
          </a>
        ) : (
          <span key={i}>{part.text}</span>
        )
      )}
    </>
  );
}

/** "14:32" in the user's timezone, ticking every 30 seconds, with the offset from the viewer. */
export function LocalTime({ timeZone }: { timeZone: string }) {
  const { t, i18n } = useTranslation();
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(id);
  }, []);
  const local = localTimeIn(timeZone, now, i18n.language);
  if (!local) return null;
  const { offsetHours } = local;
  const hours = Math.abs(offsetHours);
  const offsetLabel =
    offsetHours === 0
      ? t('profile.sameTime')
      : t(offsetHours > 0 ? 'profile.hoursAhead' : 'profile.hoursBehind', {
          hours: Number.isInteger(hours) ? hours : Number(hours.toFixed(1)),
        });
  return (
    <>
      <span className={css.timeValue}>{local.time}</span>
      <span className={css.timeOffset}>{offsetLabel}</span>
    </>
  );
}

/**
 * Bio preview clamped to three lines. When it doesn't fit, a "View full bio" button opens the
 * whole text in a modal.
 */
export function ExpandableBio({
  text,
  displayName,
  plain = false,
}: {
  text: string;
  displayName: string;
  plain?: boolean;
}) {
  const { t } = useTranslation();
  const previewRef = useRef<HTMLDivElement>(null);
  const [overflowing, setOverflowing] = useState(false);
  const [open, setOpen] = useState(false);

  useLayoutEffect(() => {
    const el = previewRef.current;
    if (el) setOverflowing(el.scrollHeight > el.clientHeight + 1);
  }, [text]);

  return (
    <div className={plain ? cardCss.bioPlain : cardCss.bioBox}>
      <div ref={previewRef} className={cardCss.bioClamped}>
        <LinkifiedText text={text} />
      </div>
      {overflowing && (
        <button type="button" className={cardCss.viewBioButton} onClick={() => setOpen(true)}>
          {t('profile.viewFullBio')}
        </button>
      )}
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={t('profile.bioTitle', { name: displayName })}
        size="md"
        zIndex={7600}
      >
        <div className={cardCss.fullBio}>
          <LinkifiedText text={text} />
        </div>
      </Modal>
    </div>
  );
}

/** A private note about this user, saved when the box loses focus. */
export function NotesSection({
  client,
  userId,
}: {
  client: MatrixClient | null | undefined;
  userId: string;
}) {
  const { t } = useTranslation();
  const { getNote, saveNote } = useUserNotes(client);
  const stored = getNote(userId);
  const [draft, setDraft] = useState(stored);
  const [showSaved, setShowSaved] = useState(false);
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastUserIdRef = useRef(userId);

  // Reset the draft when the popup switches to a different user.
  if (lastUserIdRef.current !== userId) {
    lastUserIdRef.current = userId;
    if (draft !== stored) setDraft(stored);
  }

  // The account's notes arrive after the popup opens
  useEffect(() => {
    setDraft((current) => (current === '' ? stored : current));
  }, [stored]);

  useEffect(
    () => () => {
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
    },
    []
  );

  return (
    <div className={css.notesSection}>
      <span className={css.notesLabel}>
        <NotePencilIcon size={14} />
        {t('profile.notes')}
      </span>
      <textarea
        className={css.notesTextarea}
        value={draft}
        placeholder={t(
          isTouchDevice() ? 'profile.notesPlaceholderTouch' : 'profile.notesPlaceholder'
        )}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          if (draft === stored) return;
          saveNote(userId, draft);
          setShowSaved(true);
          if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
          savedTimerRef.current = setTimeout(() => setShowSaved(false), 1500);
        }}
      />
      <span className={css.notesSaved} data-visible={showSaved}>
        {t('profile.notesSaved')}
      </span>
    </div>
  );
}

export function useUserPresenceInfo(
  client: MatrixClient | null | undefined,
  userId: string | null | undefined
) {
  return useQuery({
    queryKey: ['user-presence-info', client?.userId(), userId],
    queryFn: async () => {
      if (!client || !userId) return null;
      try {
        const p = await client.presence(userId);
        if (p && (p.lastActiveAgoMs != null || p.statusMsg)) {
          return {
            lastActiveAgo: p.lastActiveAgoMs,
            statusMsg: p.statusMsg,
          };
        }
      } catch {
        // fallback
      }
      const session = client.session();
      if (!session?.accessToken || !session?.homeserverUrl) return null;
      const base = session.homeserverUrl.replace(/\/+$/, '');
      try {
        const res = await fetch(
          `${base}/_matrix/client/v3/presence/${encodeURIComponent(userId)}/status`,
          {
            headers: { Authorization: `Bearer ${session.accessToken}` },
          }
        );
        if (res.ok) {
          const json = (await res.json()) as {
            last_active_ago?: number;
            status_msg?: string;
          };
          return {
            lastActiveAgo: typeof json.last_active_ago === 'number' ? json.last_active_ago : null,
            statusMsg: typeof json.status_msg === 'string' ? json.status_msg : null,
          };
        }
      } catch {
        // ignore
      }
      return null;
    },
    enabled: !!client && !!userId,
    staleTime: 30_000,
  });
}

/** "In room since Mar 4, 2024" for the room the card was opened from. Hidden when unknown. */
export function MemberSinceRow({
  client,
  roomId,
  room,
  userId,
}: {
  client?: MatrixClient | null | undefined;
  roomId?: string | null | undefined;
  room?: unknown;
  userId: string;
}) {
  const { t, i18n } = useTranslation();
  const since = useMemberSince(client, roomId, userId, room);
  if (since === null) return null;
  const date = new Date(since).toLocaleDateString(i18n.language, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
  return (
    <div className={css.infoRow}>
      <span className={css.infoIcon}>
        <CalendarBlankIcon size={14} />
      </span>
      <span className={css.infoValue}>{t('profile.memberSince', { date })}</span>
    </div>
  );
}

/**
 * Cross-signing trust badge: "Verified" (green check) or "Not verified" (grey).
 */
export function VerificationRow({
  client,
  userId,
}: {
  client: MatrixClient | null | undefined;
  userId: string;
}) {
  const { t } = useTranslation();
  const status = useUserVerification(client ?? null, userId);
  const setEmojiModal = useSetAtom(emojiVerificationAtom);
  const toast = useToast();
  const [starting, setStarting] = useState(false);
  if (!status || (!status.verified && !status.canVerify)) return null;

  const startVerification = async () => {
    if (!client) return;
    setStarting(true);
    try {
      await startUserVerification(client, userId, setEmojiModal);
    } catch (err) {
      toast.error(t('profile.verifyFailed', { error: getErrorMessage(err) }));
    } finally {
      setStarting(false);
    }
  };

  const Icon = status.verified ? SealCheckIcon : ShieldIcon;
  const label = status.verified ? t('profile.verifiedUser') : t('profile.notVerifiedUser');
  const valueClass = status.verified ? cardCss.verificationOk : css.infoValue;

  return (
    <div className={css.infoRow}>
      <span className={css.infoIcon}>
        <Icon size={14} weight={status.verified ? 'fill' : 'regular'} />
      </span>
      <span className={valueClass}>{label}</span>
      {!status.verified && (
        <button
          type="button"
          className={cardCss.verifyButton}
          onClick={startVerification}
          disabled={starting}
        >
          {t('profile.verifyUser')}
        </button>
      )}
    </div>
  );
}

/** Legacy presence status message */
export function StatusMessageRow({
  client,
  userId,
  statusMsg,
}: {
  client?: MatrixClient | null;
  userId?: string | null;
  statusMsg?: string | null;
}) {
  const { data } = useUserPresenceInfo(client, userId);
  const msg = statusMsg || data?.statusMsg;
  if (!msg) return null;
  return (
    <div className={css.infoRow}>
      <span className={css.infoIcon}>
        <ChatTeardropTextIcon size={14} />
      </span>
      <span className={css.infoValue}>
        <LinkifiedText text={msg} />
      </span>
    </div>
  );
}

/** "Last seen 5 minutes ago" from presence, shown only while the user isn't live-online. */
export function LastActiveRow({
  client,
  userId,
  isOnline,
}: {
  client: MatrixClient | null | undefined;
  userId: string;
  isOnline: boolean;
}) {
  const { t, i18n } = useTranslation();
  const [, forceTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => forceTick((n) => n + 1), 30_000);
    return () => window.clearInterval(id);
  }, []);
  const { data } = useUserPresenceInfo(client, userId);
  if (isOnline || !client || !data || data.lastActiveAgo == null) return null;
  const lastActiveTs = Date.now() - data.lastActiveAgo;
  if (!Number.isFinite(lastActiveTs) || lastActiveTs <= 0) return null;
  return (
    <div className={css.infoRow}>
      <span className={css.infoIcon}>
        <ClockCounterClockwiseIcon size={14} />
      </span>
      <Tooltip content={new Date(lastActiveTs).toLocaleString(i18n.language)}>
        <span className={css.infoValue}>
          {t('profile.lastSeen', { time: formatRelativeTime(lastActiveTs, t, i18n.language) })}
        </span>
      </Tooltip>
    </div>
  );
}

/** "3 sessions (2 verified)" - how many devices this user is signed in on. */
export function DeviceSummaryRow({
  client,
  userId,
}: {
  client: MatrixClient | null | undefined;
  userId: string;
}) {
  const { t } = useTranslation();
  const summary = useUserDeviceSummary(client, userId);
  if (!summary) return null;
  return (
    <div className={css.infoRow}>
      <span className={css.infoIcon}>
        <DevicesIcon size={14} />
      </span>
      <span className={css.infoValue}>
        {t('profile.sessionCount', { count: summary.count })}
        {summary.verifiedCount > 0 &&
          ` (${t('profile.sessionsVerified', { count: summary.verifiedCount })})`}
      </span>
    </div>
  );
}

export function ActivityPanel({ room: _room, userId: _userId }: { room: unknown; userId: string }) {
  const { t } = useTranslation();
  return (
    <div className={cardCss.activityCard}>
      <span className={cardCss.activityCardTitle}>{t('profile.activity.title')}</span>
      <span className={cardCss.activityMeta}>{t('profile.activity.none')}</span>
      <span className={cardCss.activityMeta}>{t('profile.activity.localNote')}</span>
    </div>
  );
}
