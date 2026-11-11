import { useState } from 'react';
import type { WizardClient as MatrixClient } from '@wizardchat/core';
import { useTranslation } from 'react-i18next';
import { Modal } from '@/app/components/Modal/Modal';
import { Button } from '@/app/components/Button/Button';
import { Input } from '@/app/components/Input/Input';
import { useToast } from '@/app/hooks/useToast';
import * as dialogCss from '@/app/components/Dialog/Dialog.css';
import { eventNearDate, jumpToDateErrorKey, startOfLocalDay, toDateInputValue } from './jumpToDate';

interface Props {
  open: boolean;
  onClose: () => void;
  client: MatrixClient;
  roomId: string;
  onJump: (eventId: string) => void;
}

export function JumpToDateModal({ open, onClose, client, roomId, onJump }: Props) {
  const { t } = useTranslation();
  const toast = useToast();
  const [value, setValue] = useState(() => toDateInputValue(new Date()));
  const [busy, setBusy] = useState(false);
  const today = toDateInputValue(new Date());

  const submit = async () => {
    const ts = startOfLocalDay(value);
    if (ts === null || busy) return;
    setBusy(true);
    try {
      const eventId = await eventNearDate(
        (at, direction) => client.timestampToEvent(roomId, at, direction),
        ts
      );
      if (!eventId) {
        toast.info(t('room.jumpToDate.notFound'));
        return;
      }
      onClose();
      onJump(eventId);
    } catch (err) {
      toast.error(t(jumpToDateErrorKey(err)));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('room.jumpToDate.title')}
      size="sm"
      footer={
        <>
          <Button variant="secondary" size="md" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button variant="primary" size="md" onClick={submit} disabled={busy || !value}>
            {t('room.jumpToDate.jump')}
          </Button>
        </>
      }
    >
      <p className={dialogCss.dialogMessage}>{t('room.jumpToDate.description')}</p>
      <Input
        type="date"
        value={value}
        max={today}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && void submit()}
        data-dialog-autofocus
      />
    </Modal>
  );
}
