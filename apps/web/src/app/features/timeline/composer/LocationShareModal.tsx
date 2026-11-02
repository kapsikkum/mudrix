import { useState, useCallback, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { WizardClient as MatrixClient } from '@wizardchat/core';
import { MapPinIcon, SpinnerGapIcon, CrosshairIcon } from '@phosphor-icons/react';
import { Modal } from '@/app/components/Modal';
import { Button } from '@/app/components/Button';
import { Field } from '@/app/components/Field';
import { useToast } from '@/app/hooks/useToast';
import { getErrorMessage } from '@/util/error';
import { sendRawEvent, type ReplyTarget } from './sendMessageContent';
import { useComposerTimeline } from './composerTimeline';
import * as css from './LocationShareModal.css';

interface Props {
  open: boolean;
  onClose: () => void;
  client: MatrixClient;
  roomId: string;
  threadId?: string | null;
  replyTo?: ReplyTarget | null;
  myId?: string;
  onReplySent?: () => void;
}

type Status = 'requesting' | 'ready' | 'error';

export function LocationShareModal({
  open,
  onClose,
  client,
  roomId,
  threadId,
  replyTo,
  myId,
  onReplySent,
}: Props) {
  const { t } = useTranslation();
  const toast = useToast();
  const getTimeline = useComposerTimeline(client, roomId, threadId);

  const [status, setStatus] = useState<Status>('requesting');
  const [error, setError] = useState<string | null>(null);
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');
  const [description, setDescription] = useState('');
  const [sending, setSending] = useState(false);
  const requestTokenRef = useRef(0);

  const requestLocation = useCallback(() => {
    const token = ++requestTokenRef.current;
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setStatus('error');
      setError(t('composer.location.unavailable'));
      return;
    }
    setStatus('requesting');
    setError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (token !== requestTokenRef.current) return;
        setLatitude(String(pos.coords.latitude));
        setLongitude(String(pos.coords.longitude));
        setStatus('ready');
      },
      (err) => {
        if (token !== requestTokenRef.current) return;
        setStatus('error');
        setError(
          err.code === err.PERMISSION_DENIED
            ? t('composer.location.permissionDenied')
            : t('composer.location.unavailable')
        );
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  }, [t]);

  useEffect(() => {
    if (!open) return;
    setLatitude('');
    setLongitude('');
    setDescription('');
    requestLocation();
  }, [open, requestLocation]);

  const handleClose = useCallback(() => {
    if (sending) return;
    requestTokenRef.current++;
    onClose();
  }, [sending, onClose]);

  const parsedLat = Number.parseFloat(latitude);
  const parsedLon = Number.parseFloat(longitude);
  const latValid = Number.isFinite(parsedLat) && parsedLat >= -90 && parsedLat <= 90;
  const lonValid = Number.isFinite(parsedLon) && parsedLon >= -180 && parsedLon <= 180;
  const canSend = latValid && lonValid && !sending;

  const handleSend = useCallback(async () => {
    if (!canSend) return;

    const geoUri = `geo:${parsedLat},${parsedLon}`;
    const desc = description.trim();
    const content: Record<string, unknown> = {
      msgtype: 'm.location',
      body: desc || geoUri,
      geo_uri: geoUri,
      'org.matrix.msc3488.location': { uri: geoUri, description: desc || undefined },
      'org.matrix.msc3488.asset': { type: 'm.self' },
      'org.matrix.msc3488.ts': Date.now(),
    };

    setSending(true);
    try {
      const timeline = await getTimeline();
      if (replyTo?.eventId) {
        await sendRawEvent('m.room.message', content, { timeline, threadId, replyTo, myId });
      } else {
        await timeline.sendLocation(desc || geoUri, geoUri, desc || null);
      }
      onReplySent?.();
      handleClose();
    } catch (err) {
      toast.error(t('composer.location.sendFailed', { error: getErrorMessage(err) }));
    } finally {
      setSending(false);
    }
  }, [
    canSend,
    parsedLat,
    parsedLon,
    description,
    threadId,
    replyTo,
    getTimeline,
    myId,
    onReplySent,
    handleClose,
    toast,
    t,
  ]);

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={t('composer.location.share')}
      titleIcon={<MapPinIcon size={18} />}
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={handleClose} disabled={sending}>
            {t('common.cancel')}
          </Button>
          <Button variant="primary" onClick={handleSend} disabled={!canSend} loading={sending}>
            {t('composer.location.send')}
          </Button>
        </>
      }
    >
      {status === 'requesting' ? (
        <div className={css.status}>
          <SpinnerGapIcon size={16} className="icon-spin" />
          <span>{t('composer.location.requesting')}</span>
        </div>
      ) : (
        <button type="button" className={css.retryBtn} onClick={requestLocation} disabled={sending}>
          <CrosshairIcon size={15} />
          {t('composer.location.useCurrent')}
        </button>
      )}

      {status === 'error' && error && <div className={css.errorText}>{error}</div>}

      <div className={css.coordRow}>
        <Field label={t('composer.location.latitude')}>
          <input
            className={css.input}
            inputMode="decimal"
            value={latitude}
            placeholder="0.000000"
            onChange={(e) => setLatitude(e.target.value)}
            disabled={sending}
          />
        </Field>
        <Field label={t('composer.location.longitude')}>
          <input
            className={css.input}
            inputMode="decimal"
            value={longitude}
            placeholder="0.000000"
            onChange={(e) => setLongitude(e.target.value)}
            disabled={sending}
          />
        </Field>
      </div>

      <Field label={t('composer.location.description')}>
        <input
          className={css.input}
          value={description}
          maxLength={200}
          placeholder={t('composer.location.descriptionPlaceholder')}
          onChange={(e) => setDescription(e.target.value)}
          disabled={sending}
        />
      </Field>
    </Modal>
  );
}
