import { useEffect, useState } from 'react';
import type { EventVersion, WizardClient as MatrixClient } from '@wizardchat/core';
import { ClockCounterClockwiseIcon } from '@phosphor-icons/react';
import { useTranslation } from 'react-i18next';
import { Modal } from '@/app/components/Modal';
import { Spinner } from '@/app/components/Spinner';
import { getErrorMessage } from '@/util/error';
import * as css from './EditHistoryModal.css';

interface Props {
  client: MatrixClient;
  roomId: string;
  /** The edited message whose versions are listed; null keeps the modal closed. */
  eventId: string | null;
  onClose: () => void;
}

export function EditHistoryModal({ client, roomId, eventId, onClose }: Props) {
  const { t, i18n } = useTranslation();
  const [versions, setVersions] = useState<EventVersion[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!eventId) return undefined;
    let cancelled = false;
    setVersions(null);
    setError(null);
    client
      .eventEditHistory(roomId, eventId)
      .then((list) => {
        // The core lists the oldest first; the newest version leads.
        if (!cancelled) setVersions([...list].reverse());
      })
      .catch((err) => {
        if (!cancelled) setError(getErrorMessage(err));
      });
    return () => {
      cancelled = true;
    };
  }, [client, roomId, eventId]);

  if (!eventId) return null;

  return (
    <Modal
      open
      onClose={onClose}
      title={t('timeline.editHistory.title')}
      titleIcon={<ClockCounterClockwiseIcon size={18} />}
      size="md"
    >
      {error ? (
        <div className={css.status}>{t('timeline.editHistory.failed', { error })}</div>
      ) : !versions ? (
        <div className={css.status}>
          <Spinner />
        </div>
      ) : versions.length <= 1 ? (
        <div className={css.status}>{t('timeline.editHistory.empty')}</div>
      ) : (
        <div className={css.list}>
          {versions.map((v, i) => (
            <div key={v.eventId} className={css.version}>
              <div className={css.versionMeta}>
                {i === 0 && (
                  <span className={css.versionBadge}>{t('timeline.editHistory.current')}</span>
                )}
                {v.isOriginal && (
                  <span className={css.versionBadge}>{t('timeline.editHistory.original')}</span>
                )}
                <span>{new Date(v.timestamp).toLocaleString(i18n.language)}</span>
              </div>
              <div className={css.versionBody}>{v.body}</div>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}
