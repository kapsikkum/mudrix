import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { NotePencilIcon } from '@phosphor-icons/react';
import type { WizardClient as MatrixClient } from '@wizardchat/core';
import { Modal } from '@/app/components/Modal';
import { linkifyParts, localTimeIn } from '@/util/profileFields';
import { useUserNotes } from '@/app/hooks/useUserNotes';
import { isTouchDevice } from '@/util/touch';
import * as css from './ProfileExtras.css';
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
