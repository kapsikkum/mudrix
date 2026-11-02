import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { WizardClient as MatrixClient } from '@wizardchat/core';
import { vars } from '@/theme/vars.css';
import { Waveform } from '../../../components/Waveform/Waveform';
import {
  MicrophoneIcon,
  PauseIcon,
  PlayIcon,
  TrashIcon,
  StopIcon,
  PaperPlaneRightIcon,
  SpinnerGapIcon,
  XIcon,
} from '@phosphor-icons/react';
import { useToast } from '@/app/hooks/useToast';
import { Tooltip } from '@/app/components/Tooltip';
import { getErrorMessage } from '@/util/error';
import { sendVoiceMessage } from './sendVoiceMessage';
import { useComposerTimeline } from './composerTimeline';
import type { ReplyTarget } from './sendMessageContent';
import {
  useVoiceRecorder,
  VOICE_MAX_DURATION_MS,
  VOICE_WARN_REMAINING_MS,
  type VoiceRecorderError,
} from './useVoiceRecorder';
import * as css from './VoiceRecordComposerTile.css';

interface Props {
  client: MatrixClient;
  roomId: string;
  threadId?: string | null;
  replyTo: ReplyTarget | null;
  myId?: string;
  onReplySent?: () => void;
  onClose: () => void;
}

const ERROR_KEYS: Record<Exclude<VoiceRecorderError, null>, string> = {
  unsupported: 'composer.voice.unsupported',
  permission: 'composer.voice.permissionDenied',
  failed: 'composer.voice.failed',
};

const LIVE_BARS = 18;

function formatTime(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export function VoiceRecordComposerTile({
  client,
  roomId,
  threadId,
  replyTo,
  myId,
  onReplySent,
  onClose,
}: Props) {
  const { t } = useTranslation();
  const toast = useToast();
  const recorder = useVoiceRecorder();
  const getTimeline = useComposerTimeline(client, roomId, threadId);
  const { status, elapsedMs, liveLevels, durationMs, waveform, previewUrl, blob } = recorder;
  const [sending, setSending] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [previewTime, setPreviewTime] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const normalizedWaveform = useMemo(() => {
    if (waveform.length === 0) return [];
    const max = waveform.reduce((m, v) => Math.max(m, v), 0);
    return max > 1 ? waveform.map((v) => Math.min(1, v / 1024)) : waveform;
  }, [waveform]);

  useEffect(() => {
    if (!recorder.supported) return;
    void recorder.start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const togglePreview = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      audio
        .play()
        .catch((err) =>
          toast.error(t('composer.voice.playFailed', { error: getErrorMessage(err) }))
        );
    } else {
      audio.pause();
    }
  };

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    const audio = audioRef.current;
    if (!audio || durationMs <= 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    audio.currentTime = ratio * (durationMs / 1000);
    setPreviewTime(audio.currentTime);
  };

  const handleSend = async () => {
    if (!recorder.blob || sending) return;
    setSending(true);
    try {
      await sendVoiceMessage(recorder.blob, {
        timeline: await getTimeline(),
        replyTo,
        myId,
        durationMs: recorder.durationMs,
        waveform: recorder.waveform,
      });
      onReplySent?.();
      onClose();
    } catch (err) {
      toast.error(t('composer.voice.sendFailed', { error: getErrorMessage(err) }));
    } finally {
      setSending(false);
    }
  };

  const handleCancel = () => {
    recorder.cancel();
    onClose();
  };

  if (!recorder.supported) {
    return (
      <div className={css.tile}>
        <span className={css.errorText}>{t('composer.voice.unsupported')}</span>
        <div className={css.controls}>
          <Tooltip content={t('common.cancel')}>
            <button
              type="button"
              className={css.iconBtn}
              onClick={onClose}
              aria-label={t('common.cancel')}
            >
              <XIcon size={16} />
            </button>
          </Tooltip>
        </div>
      </div>
    );
  }

  if (recorder.error) {
    return (
      <div className={css.tile}>
        <span className={css.errorText}>{t(ERROR_KEYS[recorder.error])}</span>
        <div className={css.controls}>
          <Tooltip content={t('composer.voice.retry')}>
            <button
              type="button"
              className={css.iconBtn}
              onClick={() => void recorder.start()}
              aria-label={t('composer.voice.retry')}
            >
              <MicrophoneIcon size={16} />
            </button>
          </Tooltip>
          <Tooltip content={t('common.cancel')}>
            <button
              type="button"
              className={css.iconBtn}
              onClick={onClose}
              aria-label={t('common.cancel')}
            >
              <XIcon size={16} />
            </button>
          </Tooltip>
        </div>
      </div>
    );
  }

  if (status === 'recording' || status === 'paused') {
    const paused = status === 'paused';
    const remaining = Math.max(0, VOICE_MAX_DURATION_MS - elapsedMs);
    const warn = remaining <= VOICE_WARN_REMAINING_MS;
    return (
      <div className={css.tile}>
        <span className={paused ? `${css.recordDot} ${css.recordDotPaused}` : css.recordDot} />
        <span className={warn ? `${css.timer} ${css.timerWarn}` : css.timer}>
          {formatTime(warn ? remaining : elapsedMs)}
        </span>
        <div className={css.waveform}>
          {liveLevels.slice(-LIVE_BARS).map((level, index) => (
            <span
              key={index}
              className={css.bar}
              style={{ height: `${Math.max(2, level * 24)}px` }}
            />
          ))}
        </div>
        <div className={css.controls}>
          <Tooltip content={t(paused ? 'composer.voice.resume' : 'composer.voice.pause')}>
            <button
              type="button"
              className={css.iconBtn}
              onClick={paused ? recorder.resume : recorder.pause}
              aria-label={t(paused ? 'composer.voice.resume' : 'composer.voice.pause')}
            >
              {paused ? (
                <PlayIcon size={16} weight="fill" />
              ) : (
                <PauseIcon size={16} weight="fill" />
              )}
            </button>
          </Tooltip>
          <Tooltip content={t('composer.voice.cancel')}>
            <button
              type="button"
              className={css.dangerBtn}
              onClick={handleCancel}
              aria-label={t('composer.voice.cancel')}
            >
              <TrashIcon size={16} />
            </button>
          </Tooltip>
          <Tooltip content={t('composer.voice.stop')}>
            <button
              type="button"
              className={css.accentBtn}
              onClick={() => void recorder.stop()}
              aria-label={t('composer.voice.stop')}
            >
              <StopIcon size={16} weight="fill" />
            </button>
          </Tooltip>
        </div>
      </div>
    );
  }

  if (status === 'stopped') {
    return (
      <div className={css.tile}>
        <audio
          ref={audioRef}
          src={previewUrl ?? undefined}
          className={css.hiddenAudio}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => {
            setPlaying(false);
            setPreviewTime(0);
          }}
          onTimeUpdate={(e) => setPreviewTime(e.currentTarget.currentTime)}
        />
        <Tooltip content={t(playing ? 'voiceMessagePlayer.pause' : 'voiceMessagePlayer.play')}>
          <button
            type="button"
            className={css.accentBtn}
            onClick={togglePreview}
            disabled={!previewUrl}
            aria-label={t(playing ? 'voiceMessagePlayer.pause' : 'voiceMessagePlayer.play')}
          >
            {playing ? <PauseIcon size={16} weight="fill" /> : <PlayIcon size={16} weight="fill" />}
          </button>
        </Tooltip>
        <span className={css.timer}>
          {formatTime(playing ? durationMs - previewTime * 1000 : durationMs)}
        </span>
        <div className={css.waveform} onClick={handleSeek}>
          {normalizedWaveform.length > 0 ? (
            <Waveform
              data={normalizedWaveform}
              height={26}
              progress={durationMs > 0 ? Math.min(1, (previewTime * 1000) / durationMs) : 0}
              color={`rgba(${vars.color.accentRgb}, 0.2)`}
              progressColor={vars.color.accent}
            />
          ) : null}
        </div>
        <div className={css.controls}>
          <Tooltip content={t('composer.voice.cancel')}>
            <button
              type="button"
              className={css.dangerBtn}
              onClick={handleCancel}
              disabled={sending}
              aria-label={t('composer.voice.cancel')}
            >
              <TrashIcon size={16} />
            </button>
          </Tooltip>
          <Tooltip content={t('composer.voice.send')}>
            <button
              type="button"
              className={css.accentBtn}
              onClick={handleSend}
              disabled={sending || !blob}
              aria-label={t('composer.voice.send')}
            >
              {sending ? (
                <SpinnerGapIcon size={16} className="icon-spin" />
              ) : (
                <PaperPlaneRightIcon size={16} weight="fill" />
              )}
            </button>
          </Tooltip>
        </div>
      </div>
    );
  }

  return (
    <div className={css.tile}>
      <div className={css.statusRow}>
        <SpinnerGapIcon size={15} className="icon-spin" />
        {t('composer.voice.requesting')}
      </div>
      <div className={css.controls}>
        <Tooltip content={t('common.cancel')}>
          <button
            type="button"
            className={css.iconBtn}
            onClick={onClose}
            aria-label={t('common.cancel')}
          >
            <XIcon size={16} />
          </button>
        </Tooltip>
      </div>
    </div>
  );
}
