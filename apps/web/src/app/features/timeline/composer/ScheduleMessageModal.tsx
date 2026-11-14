import { useState, useCallback, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { WizardClient as MatrixClient } from '@wizardchat/core';
import { ClockIcon, PaperPlaneRightIcon, XIcon } from '@phosphor-icons/react';
import { Modal } from '@/app/components/Modal';
import { Button } from '@/app/components/Button';
import { Field } from '@/app/components/Field';
import { useRoom } from '@/app/data';
import { useToast } from '@/app/hooks/useToast';
import { getErrorMessage } from '@/util/error';
import {
  cancelScheduledMessage,
  isEncryptedRoomRefusal,
  isUnsupportedByServer,
  listScheduledMessages,
  sendScheduledMessageNow,
  useDelayedEventsSupport,
  type ScheduledMessage,
} from './delayedEvents';
import * as css from './ScheduleMessageModal.css';

interface Props {
  open: boolean;
  onClose: () => void;
  client: MatrixClient;
  roomId: string;
  /** Plain-text preview of the message currently in the composer; empty when there is none. */
  draftPreview: string;
  /** Schedules the composer content to be sent after `delayMs`. Rejects on failure. */
  onSchedule: (delayMs: number) => Promise<void>;
}

const MIN_DELAY_MS = 5_000;
const REFRESH_MS = 20_000;

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** Formats a Date as the local `YYYY-MM-DDTHH:mm` value a datetime-local input expects. */
function toLocalInputValue(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}T${pad2(
    date.getHours()
  )}:${pad2(date.getMinutes())}`;
}

function tomorrowAtNine(): Date {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(9, 0, 0, 0);
  return d;
}

export function ScheduleMessageModal({
  open,
  onClose,
  client,
  roomId,
  draftPreview,
  onSchedule,
}: Props) {
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const featureSupported = useDelayedEventsSupport(client);
  const roomAllowed = !(useRoom(roomId)?.isEncrypted ?? false);

  const [when, setWhen] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [scheduled, setScheduled] = useState<ScheduledMessage[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  // The server turned out not to take delayed events although it did not say so up front.
  const [serverRefused, setServerRefused] = useState(false);
  const supported = serverRefused ? false : featureSupported;

  const refresh = useCallback(async () => {
    try {
      setScheduled(await listScheduledMessages(client, roomId));
    } catch (err) {
      if (isUnsupportedByServer(err)) setServerRefused(true);
      setScheduled((prev) => prev ?? []);
    }
  }, [client, roomId]);

  useEffect(() => {
    if (!open || !supported) return undefined;
    void refresh();
    const timer = window.setInterval(() => void refresh(), REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [open, supported, refresh]);

  useEffect(() => {
    if (open) setWhen(toLocalInputValue(new Date(Date.now() + 60 * 60 * 1000)));
  }, [open]);

  const delayMs = useMemo(() => {
    const target = when ? new Date(when).getTime() : NaN;
    return Number.isFinite(target) ? target - Date.now() : NaN;
  }, [when]);

  const hasDraft = draftPreview.trim().length > 0;
  const available = supported === true && roomAllowed;
  const canSubmit = available && hasDraft && Number.isFinite(delayMs) && delayMs >= MIN_DELAY_MS;

  const handleSubmit = useCallback(async () => {
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    try {
      await onSchedule(delayMs);
      toast.success(t('composer.schedule.scheduled'));
      await refresh();
    } catch (err) {
      if (isUnsupportedByServer(err)) setServerRefused(true);
      toast.error(
        isUnsupportedByServer(err)
          ? t('composer.schedule.unsupported')
          : isEncryptedRoomRefusal(err)
            ? t('composer.schedule.encrypted')
            : t('composer.schedule.failed', { error: getErrorMessage(err) })
      );
    } finally {
      setSubmitting(false);
    }
  }, [canSubmit, submitting, onSchedule, delayMs, toast, t, refresh]);

  const runAction = useCallback(
    async (delayId: string, action: () => Promise<unknown>, errorKey: string) => {
      setBusyId(delayId);
      try {
        await action();
      } catch (err) {
        toast.error(t(errorKey, { error: getErrorMessage(err) }));
      } finally {
        setBusyId(null);
        await refresh();
      }
    },
    [toast, t, refresh]
  );

  const formatWhen = (ts: number): string =>
    new Date(ts).toLocaleString(i18n.language, {
      dateStyle: 'medium',
      timeStyle: 'short',
    });

  let unavailableReason: string | null = null;
  if (supported === false) unavailableReason = t('composer.schedule.unsupported');
  else if (!roomAllowed) unavailableReason = t('composer.schedule.encrypted');

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('composer.schedule.title')}
      titleIcon={<ClockIcon size={18} />}
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            {t('common.close')}
          </Button>
          <Button
            variant="primary"
            onClick={handleSubmit}
            disabled={!canSubmit}
            loading={submitting}
          >
            {t('composer.schedule.submit')}
          </Button>
        </>
      }
    >
      {unavailableReason && <p className={css.notice}>{unavailableReason}</p>}

      <Field
        label={t('composer.schedule.messageLabel')}
        hint={hasDraft ? undefined : t('composer.schedule.noDraft')}
      >
        <div className={css.preview}>{hasDraft ? draftPreview : '—'}</div>
      </Field>

      <Field
        label={t('composer.schedule.whenLabel')}
        error={
          available && Number.isFinite(delayMs) && delayMs < MIN_DELAY_MS
            ? t('composer.schedule.pastTime')
            : undefined
        }
      >
        <div className={css.whenRow}>
          <input
            type="datetime-local"
            className={css.dateInput}
            value={when}
            min={toLocalInputValue(new Date())}
            onChange={(e) => setWhen(e.target.value)}
            disabled={!available || submitting}
            aria-label={t('composer.schedule.whenLabel')}
          />
          <button
            type="button"
            className={css.presetBtn}
            disabled={!available || submitting}
            onClick={() => setWhen(toLocalInputValue(new Date(Date.now() + 60 * 60 * 1000)))}
          >
            {t('composer.schedule.inOneHour')}
          </button>
          <button
            type="button"
            className={css.presetBtn}
            disabled={!available || submitting}
            onClick={() => setWhen(toLocalInputValue(tomorrowAtNine()))}
          >
            {t('composer.schedule.tomorrowMorning')}
          </button>
        </div>
      </Field>

      {supported && (
        <Field label={t('composer.schedule.listTitle')}>
          {scheduled === null ? (
            <p className={css.empty}>{t('common.loading')}</p>
          ) : scheduled.length === 0 ? (
            <p className={css.empty}>{t('composer.schedule.empty')}</p>
          ) : (
            <ul className={css.list}>
              {scheduled.map((item) => (
                <li key={item.delayId} className={css.item}>
                  <div className={css.itemInfo}>
                    <span className={css.itemWhen}>{formatWhen(item.sendAt)}</span>
                    <span className={css.itemBody}>{item.body || '—'}</span>
                  </div>
                  <button
                    type="button"
                    className={css.itemBtn}
                    disabled={busyId === item.delayId}
                    onClick={() =>
                      void runAction(
                        item.delayId,
                        () => sendScheduledMessageNow(client, item.delayId),
                        'composer.schedule.sendNowFailed'
                      )
                    }
                  >
                    <PaperPlaneRightIcon size={14} />
                    {t('composer.schedule.sendNow')}
                  </button>
                  <button
                    type="button"
                    className={css.itemBtnDanger}
                    disabled={busyId === item.delayId}
                    onClick={() =>
                      void runAction(
                        item.delayId,
                        () => cancelScheduledMessage(client, item.delayId),
                        'composer.schedule.cancelFailed'
                      )
                    }
                  >
                    <XIcon size={14} />
                    {t('composer.schedule.cancel')}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Field>
      )}
    </Modal>
  );
}
