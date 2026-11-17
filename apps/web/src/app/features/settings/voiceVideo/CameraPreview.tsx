import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { VideoCameraIcon } from '@phosphor-icons/react';
import { Button } from '@/app/components/Button';
import * as layoutCss from '../Settings.css';
import * as css from './VoiceVideo.css';

export function CameraPreview({ deviceId, onAccess }: { deviceId?: string; onAccess: () => void }) {
  const { t } = useTranslation();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [previewing, setPreviewing] = useState(false);
  const [failed, setFailed] = useState(false);
  const onAccessRef = useRef(onAccess);
  onAccessRef.current = onAccess;

  useEffect(() => {
    if (!previewing) return;
    const video = videoRef.current;
    let cancelled = false;
    let stream: MediaStream | null = null;
    void navigator.mediaDevices
      .getUserMedia({ video: deviceId ? { deviceId: { exact: deviceId } } : true })
      .then((s) => {
        stream = s;
        if (cancelled) {
          s.getTracks().forEach((track) => track.stop());
          return;
        }
        setFailed(false);
        if (video) video.srcObject = s;
        onAccessRef.current();
      })
      .catch(() => {
        if (cancelled) return;
        setFailed(true);
        setPreviewing(false);
      });
    return () => {
      cancelled = true;
      stream?.getTracks().forEach((track) => track.stop());
      if (video) video.srcObject = null;
    };
  }, [previewing, deviceId]);

  return (
    <div className={css.preview}>
      <div className={css.previewFrame}>
        {previewing ? (
          <video ref={videoRef} className={css.previewVideo} autoPlay muted playsInline />
        ) : (
          <VideoCameraIcon size={40} className={css.previewIcon} />
        )}
      </div>
      <Button
        variant={previewing ? 'secondary' : 'primary'}
        onClick={() => setPreviewing((v) => !v)}
      >
        {previewing ? t('settings.voiceVideo.stopPreview') : t('settings.voiceVideo.previewCamera')}
      </Button>
      {failed && <p className={layoutCss.settingNote}>{t('settings.voiceVideo.cameraFailed')}</p>}
    </div>
  );
}
