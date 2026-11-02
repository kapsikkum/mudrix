import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { EventSource, WizardClient } from '@wizardchat/core';
import { CodeIcon } from '@phosphor-icons/react';
import { Modal } from '@/app/components/Modal';
import { CopyButton } from '@/app/components/Button';
import type { EventEntry } from './entry';
import * as css from './ViewSourceModal.css';

interface ViewSourceModalProps {
  event: EventEntry | null;
  roomId: string;
  client: WizardClient;
  onClose: () => void;
}

export function ViewSourceModal({ event, roomId, client, onClose }: ViewSourceModalProps) {
  const { t } = useTranslation();
  const [source, setSource] = useState<EventSource | null>(null);

  const eventId = event?.eventId ?? undefined;

  useEffect(() => {
    setSource(null);
    if (!eventId) return;
    let cancelled = false;
    client
      .eventSource(roomId, eventId)
      .then((s) => !cancelled && setSource(s))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [client, roomId, eventId]);

  const original = source?.original ?? null;
  const clear = source?.decrypted ?? original;
  const decryptedSource = event
    ? {
        content: clear?.content ?? {},
        event_id: eventId,
        origin_server_ts: event.timestamp,
        room_id: roomId,
        sender: event.sender,
        type: clear?.type,
        unsigned: original?.unsigned ?? {},
      }
    : null;

  const originalSource = original;

  if (!event) return null;

  return (
    <Modal
      open={!!event}
      onClose={onClose}
      title={t('timeline.viewSourceTitle')}
      titleIcon={<CodeIcon size={18} />}
      size="xl"
    >
      <div className={css.metaRow}>
        <span className={css.metaLabel}>{t('timeline.roomId')}:</span>
        <code className={css.metaValue}>{roomId}</code>
        <CopyButton text={roomId ?? ''} />
      </div>
      <div className={css.metaRow}>
        <span className={css.metaLabel}>{t('timeline.eventId')}:</span>
        <code className={css.metaValue}>{eventId}</code>
        <CopyButton text={eventId ?? ''} />
      </div>

      <div className={css.section}>
        <div className={css.sectionHeader}>
          <span className={css.sectionTitle}>{t('timeline.decryptedSource')}</span>
          <CopyButton text={JSON.stringify(decryptedSource, null, 2)} />
        </div>
        <pre className={css.jsonBlock}>{JSON.stringify(decryptedSource, null, 2)}</pre>
      </div>

      <div className={css.section}>
        <div className={css.sectionHeader}>
          <span className={css.sectionTitle}>{t('timeline.originalSource')}</span>
          <CopyButton text={JSON.stringify(originalSource, null, 2)} />
        </div>
        <pre className={css.jsonBlock}>{JSON.stringify(originalSource, null, 2)}</pre>
      </div>
    </Modal>
  );
}
