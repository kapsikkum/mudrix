import { useState, useCallback, useMemo } from 'react';
import type { RoomTimeline } from '@wizardchat/core';
import { ChartBarHorizontalIcon } from '@phosphor-icons/react';
import { useTranslation } from 'react-i18next';
import type { EventEntry } from './entry';
import * as css from './PollViewer.css';

interface PollViewerProps {
  event: EventEntry;
  timeline: RoomTimeline | null;
}

export interface Answer {
  id: string;
  label: string;
}

export interface PollData {
  questionText: string;
  answers: Answer[];
  kind: string | undefined;
  maxSelections: number;
}

export function extractPollData(event: EventEntry): PollData {
  if (event.content.type !== 'poll') {
    return { questionText: '', answers: [], kind: undefined, maxSelections: 1 };
  }
  const { poll } = event.content;
  return {
    questionText: poll.question,
    answers: poll.answers.slice(0, 20).map((a) => ({ id: a.id, label: a.text })),
    kind: poll.undisclosed
      ? 'org.matrix.msc3381.poll.undisclosed'
      : 'org.matrix.msc3381.poll.disclosed',
    maxSelections: Math.max(1, poll.maxSelections),
  };
}

export function PollViewer({ event, timeline }: PollViewerProps) {
  const eventId = event.eventId;
  const poll = event.content.type === 'poll' ? event.content.poll : null;

  const [voting, setVoting] = useState(false);
  const { t } = useTranslation();

  const { questionText, answers } = useMemo(() => extractPollData(event), [event]);

  const isDisclosed = !!poll && !poll.undisclosed;
  const isEnded = poll?.ended ?? false;

  const voteCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const answer of poll?.answers ?? []) counts.set(answer.id, answer.votes);
    return counts;
  }, [poll]);

  const totalVotes = poll?.totalVotes ?? 0;
  const myVote = poll && poll.myVotes.length > 0 ? poll.myVotes : null;

  const handleVote = useCallback(
    async (optionId: string) => {
      if (!timeline || !eventId || voting) return;
      setVoting(true);
      try {
        await timeline.vote(eventId, [optionId]);
      } catch {
        // vote failed silently
      } finally {
        setVoting(false);
      }
    },
    [timeline, eventId, voting]
  );

  if (!questionText && !poll) {
    return <span className={css.loadingText}>{t('timeline.poll.loading')}</span>;
  }

  const showResults = isDisclosed || isEnded;
  const canVote = !isEnded && !voting && !!eventId && !!timeline;

  return (
    <div className={css.container} role="status" aria-live="polite">
      <div className={css.header}>
        <ChartBarHorizontalIcon size={18} className={css.icon} weight="fill" />
        <span className={css.question}>{questionText || t('timeline.poll.title')}</span>
      </div>

      {answers.length === 0 && (
        <span className={css.loadingText}>{t('timeline.poll.noOptions')}</span>
      )}

      {answers.map((option) => {
        const count = voteCounts.get(option.id) ?? 0;
        const pct = totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0;
        const isSelected = myVote?.includes(option.id) ?? false;

        return (
          <div
            key={option.id}
            className={`${css.optionRow}${isSelected ? ` ${css.optionRowSelected}` : ''}${!canVote ? ` ${css.optionRowEnded}` : ''}`}
            onClick={() => (canVote ? handleVote(option.id) : undefined)}
            role={canVote ? 'radio' : undefined}
            aria-checked={canVote ? isSelected : undefined}
            tabIndex={canVote ? 0 : undefined}
            onKeyDown={
              canVote
                ? (e: React.KeyboardEvent) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      handleVote(option.id);
                    }
                  }
                : undefined
            }
          >
            {showResults && totalVotes > 0 && (
              <div className={css.progressBar} style={{ width: `${pct}%` }} />
            )}

            <div className={css.optionContent}>
              <div
                className={`${css.radioCircle}${isSelected ? ` ${css.radioCircleSelected}` : ''}`}
              />
              <span className={css.optionLabel}>{option.label}</span>
              {showResults && (
                <span className={css.voteCount}>
                  {t('timeline.poll.vote', { count })} | {pct}%
                </span>
              )}
            </div>
          </div>
        );
      })}

      <div className={css.footer}>
        <span>{t('timeline.poll.vote', { count: totalVotes })}</span>
        {!isDisclosed && !isEnded && <span>| {t('timeline.poll.resultsHidden')}</span>}
        {isEnded && <span className={css.endedBadge}>{t('timeline.poll.ended')}</span>}
      </div>
    </div>
  );
}
