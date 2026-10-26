import { useState, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import type { MatrixClient } from 'matrix-js-sdk';
import { M_POLL_START, M_POLL_KIND_DISCLOSED, M_POLL_KIND_UNDISCLOSED } from 'matrix-js-sdk';
import {
  PlusIcon,
  TrashIcon,
  ChartBarHorizontalIcon,
  EyeIcon,
  EyeSlashIcon,
} from '@phosphor-icons/react';
import { Modal } from '@/app/components/Modal';
import { Button } from '@/app/components/Button';
import { Field } from '@/app/components/Field';
import { Select, type SelectOption } from '@/app/components/Select';
import { useToast } from '@/app/hooks/useToast';
import { getErrorMessage } from '@/util/error';
import { resolveRelationTarget } from '@/app/features/timeline/message/relationTarget';
import * as css from './PollCreatorModal.css';

interface Props {
  open: boolean;
  onClose: () => void;
  client: MatrixClient;
  roomId: string;
  threadId?: string | null;
  editEventId?: string;
  initialPoll?: {
    question: string;
    answers: AnswerDraft[];
    kind: PollKind;
  };
}

type PollKind = 'disclosed' | 'undisclosed';

interface AnswerDraft {
  id: string;
  text: string;
}

function randomId(): string {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 16);
}

const MAX_OPTIONS = 20;
const MIN_OPTIONS = 2;

export function PollCreatorModal({
  open,
  onClose,
  client,
  roomId,
  threadId,
  editEventId,
  initialPoll,
}: Props) {
  const { t } = useTranslation();
  const toast = useToast();
  const isEditing = !!editEventId;

  const defaultQuestion = initialPoll?.question ?? '';
  const defaultAnswers = initialPoll?.answers ?? [
    { id: randomId(), text: '' },
    { id: randomId(), text: '' },
  ];
  const defaultKind = initialPoll?.kind ?? 'disclosed';

  const [question, setQuestion] = useState(defaultQuestion);
  const [answers, setAnswers] = useState<AnswerDraft[]>(defaultAnswers);
  const [kind, setKind] = useState<PollKind>(defaultKind);
  const [sending, setSending] = useState(false);

  // Sync state when initialPoll changes (e.g., switching between edits)
  useEffect(() => {
    if (initialPoll) {
      setQuestion(initialPoll.question);
      setAnswers(initialPoll.answers);
      setKind(initialPoll.kind);
    }
  }, [initialPoll]);

  const handleClose = useCallback(() => {
    if (sending) return;
    if (!isEditing) {
      setQuestion('');
      setAnswers([
        { id: randomId(), text: '' },
        { id: randomId(), text: '' },
      ]);
      setKind('disclosed');
    }
    onClose();
  }, [sending, onClose, isEditing]);

  const addOption = useCallback(() => {
    setAnswers((prev) =>
      prev.length < MAX_OPTIONS ? [...prev, { id: randomId(), text: '' }] : prev
    );
  }, []);

  const removeOption = useCallback((id: string) => {
    setAnswers((prev) => (prev.length > MIN_OPTIONS ? prev.filter((a) => a.id !== id) : prev));
  }, []);

  const updateOption = useCallback((id: string, text: string) => {
    setAnswers((prev) => prev.map((a) => (a.id === id ? { ...a, text } : a)));
  }, []);

  const filledAnswers = answers.filter((a) => a.text.trim().length > 0);
  const canSend = question.trim().length > 0 && filledAnswers.length >= MIN_OPTIONS && !sending;

  const handleSend = useCallback(async () => {
    if (!canSend) return;

    const questionText = question.trim();
    const pollAnswers = filledAnswers.map((a) => ({
      id: a.id,
      text: a.text.trim(),
    }));

    const pollKind = kind === 'disclosed' ? M_POLL_KIND_DISCLOSED : M_POLL_KIND_UNDISCLOSED;

    const unstableKind = pollKind.name;
    const stableKind = pollKind.altName;

    const pollSubcontent = {
      question: {
        'm.text': questionText,
        'org.matrix.msc1767.text': questionText,
        body: questionText,
        msgtype: 'm.text',
      },
      kind: unstableKind,
      [stableKind]: stableKind,
      max_selections: 1,
      answers: pollAnswers.map((a) => ({
        id: a.id,
        'm.text': a.text,
        'org.matrix.msc1767.text': a.text,
        body: a.text,
      })),
    };

    const fallbackBody =
      `${questionText}\n` + pollAnswers.map((a, i) => `${i + 1}. ${a.text}`).join('\n');

    setSending(true);
    try {
      if (isEditing && editEventId) {
        const targetId = await resolveRelationTarget(client, roomId, editEventId);
        // Edit mode: send m.replace with updated poll content
        const content: Record<string, unknown> = {
          'm.new_content': {
            [M_POLL_START.name]: pollSubcontent,
            [M_POLL_START.altName]: pollSubcontent,
            'org.matrix.msc1767.text': fallbackBody,
            body: fallbackBody,
            msgtype: 'm.text',
          },
          'm.relates_to': {
            rel_type: 'm.replace',
            event_id: targetId,
          },
          body: `* ${fallbackBody}`,
          msgtype: 'm.text',
        };
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (client as any).sendEvent(roomId, threadId ?? null, M_POLL_START.name, content);
      } else {
        // Create mode: send fresh poll
        const content: Record<string, unknown> = {
          [M_POLL_START.name]: pollSubcontent,
          [M_POLL_START.altName]: pollSubcontent,
          'org.matrix.msc1767.text': fallbackBody,
          body: fallbackBody,
          msgtype: 'm.text',
        };
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (client as any).sendEvent(roomId, threadId ?? null, M_POLL_START.name, content);
      }
      handleClose();
    } catch (err) {
      toast.error(
        isEditing
          ? t('timeline.editFailed', { error: getErrorMessage(err) })
          : t('composer.poll.sendFailed', { error: getErrorMessage(err) })
      );
    } finally {
      setSending(false);
    }
  }, [
    canSend,
    question,
    filledAnswers,
    kind,
    client,
    roomId,
    editEventId,
    isEditing,
    handleClose,
    toast,
    t,
  ]);

  const kindIcon = kind === 'disclosed' ? <EyeIcon size={16} /> : <EyeSlashIcon size={16} />;

  const kindOptions: SelectOption[] = [
    { value: 'disclosed', label: t('composer.poll.kindDisclosed') },
    { value: 'undisclosed', label: t('composer.poll.kindUndisclosed') },
  ];

  const kindDesc =
    kind === 'disclosed'
      ? t('composer.poll.kindDisclosedDesc')
      : t('composer.poll.kindUndisclosedDesc');

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={t(isEditing ? 'composer.poll.editTitle' : 'composer.poll.create')}
      titleIcon={<ChartBarHorizontalIcon size={18} />}
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={handleClose} disabled={sending}>
            {t('common.cancel')}
          </Button>
          <Button variant="primary" onClick={handleSend} disabled={!canSend} loading={sending}>
            {t(isEditing ? 'common.save' : 'composer.poll.send')}
          </Button>
        </>
      }
    >
      {/* Poll kind — dropdown at the top */}
      <Field label={t('composer.poll.kindLabel')} hint={kindDesc}>
        <Select
          value={kind}
          onChange={(v) => setKind(v as PollKind)}
          options={kindOptions}
          icon={kindIcon}
          disabled={sending}
        />
      </Field>

      {/* Question */}
      <Field label={t('composer.poll.questionLabel')}>
        <input
          className={css.optionInput}
          style={{ width: '100%', boxSizing: 'border-box' }}
          placeholder={t('composer.poll.questionPlaceholder')}
          value={question}
          maxLength={340}
          onChange={(e) => setQuestion(e.target.value)}
          data-dialog-autofocus
          disabled={sending}
        />
      </Field>

      {/* Options */}
      <Field label={t('composer.poll.optionsLabel')}>
        <div>
          <div className={css.optionsList}>
            {answers.map((answer, i) => (
              <div key={answer.id} className={css.optionRow}>
                <input
                  className={css.optionInput}
                  placeholder={t('composer.poll.optionPlaceholder', { n: i + 1 })}
                  value={answer.text}
                  maxLength={340}
                  onChange={(e) => updateOption(answer.id, e.target.value)}
                  disabled={sending}
                />
                <button
                  type="button"
                  className={css.removeOptionBtn}
                  onClick={() => removeOption(answer.id)}
                  disabled={answers.length <= MIN_OPTIONS || sending}
                  aria-label={t('composer.poll.removeOption')}
                >
                  <TrashIcon size={15} />
                </button>
              </div>
            ))}
          </div>

          <button
            type="button"
            className={css.addOptionBtn}
            style={{ marginTop: '10px' }}
            onClick={addOption}
            disabled={answers.length >= MAX_OPTIONS || sending}
          >
            <PlusIcon size={14} />
            {t('composer.poll.addOption')}
          </button>
        </div>
      </Field>
    </Modal>
  );
}
