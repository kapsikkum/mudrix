import { useEffect, useState } from 'react';
import { useAtomValue } from 'jotai';
import { useTranslation } from 'react-i18next';
import { HandIcon, SmileyIcon } from '@phosphor-icons/react';
import { Tooltip } from '@/app/components/Tooltip';
import { callSessionAtom } from '@/app/store/atoms/call';
import { useCallSnapshot } from './stage/useCallSnapshot';
import * as css from './CallControlBar.css';

const REACTIONS: { emoji: string; name: string }[] = [
  { emoji: '👍', name: 'thumbsup' },
  { emoji: '👏', name: 'clap' },
  { emoji: '😂', name: 'laugh' },
  { emoji: '❤️', name: 'heart' },
  { emoji: '🎉', name: 'party' },
  { emoji: '😮', name: 'surprised' },
  { emoji: '🤔', name: 'thinking' },
  { emoji: '👎', name: 'thumbsdown' },
];

// A reaction shows on a tile for a few seconds. Waiting it out keeps a burst of clicks from
// flooding the call with messages.
const REACTION_COOLDOWN_MS = 3000;

/** Reactions and the raised hand as a column up the right side of the call. */
export function CallReactionsRail() {
  const { t } = useTranslation();
  const session = useAtomValue(callSessionAtom);
  const snapshot = useCallSnapshot();
  const [open, setOpen] = useState(false);
  const [cooling, setCooling] = useState(false);

  useEffect(() => {
    if (!cooling) return undefined;
    const timer = window.setTimeout(() => setCooling(false), REACTION_COOLDOWN_MS);
    return () => window.clearTimeout(timer);
  }, [cooling]);

  if (!session) return null;

  const handRaised = !!snapshot?.participants.find((p) => p.isLocal)?.handRaised;
  const handLabel = handRaised ? t('call.lowerHand') : t('call.raiseHand');

  const react = (emoji: string, name: string) => {
    if (cooling) return;
    setCooling(true);
    void session.sendReaction(emoji, name);
  };

  return (
    <div className={css.reactionsRail}>
      {open && (
        <div
          className={css.reactionsColumn}
          role="toolbar"
          aria-orientation="vertical"
          aria-label={t('voice.reactions')}
        >
          <button
            type="button"
            className={handRaised ? css.reactionBtnActive : css.reactionBtn}
            onClick={() => void session.setHandRaised(!handRaised)}
            aria-label={handLabel}
            aria-pressed={handRaised}
            title={handLabel}
          >
            <HandIcon size={18} weight={handRaised ? 'fill' : 'regular'} />
          </button>
          {REACTIONS.map((r) => (
            <button
              key={r.name}
              type="button"
              className={css.reactionBtn}
              onClick={() => react(r.emoji, r.name)}
              disabled={cooling}
              aria-label={r.name}
            >
              {r.emoji}
            </button>
          ))}
        </div>
      )}
      <Tooltip content={t('voice.reactions')}>
        <button
          type="button"
          className={open ? css.reactionsToggleOpen : css.reactionsToggle}
          onClick={() => setOpen((v) => !v)}
          aria-label={t('voice.reactions')}
          aria-expanded={open}
        >
          <SmileyIcon size={20} />
        </button>
      </Tooltip>
    </div>
  );
}
