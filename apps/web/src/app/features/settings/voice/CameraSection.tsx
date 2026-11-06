import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAtomValue } from 'jotai';
import { ToggleRow } from '@/app/components/Toggle';
import { callDevicesAtom } from '@/app/store/atoms';
import { useSelectDevice } from '@/app/features/calls/DeviceMenu';
import type { MediaDevices } from '@/util/mediaDevices';
import * as layoutCss from '../Settings.css';
import * as css from './VoiceAudio.css';
import { DeviceField, devicesNeedPermission } from './DeviceField';
import { useCameraPreview } from './useCameraPreview';

export function CameraSection({ media }: { media: MediaDevices }) {
  const { t } = useTranslation();
  const deviceId = useAtomValue(callDevicesAtom).videoinput ?? '';
  const { select } = useSelectDevice();
  const [previewing, setPreviewing] = useState(false);
  // Device names only become available once a stream has been opened.
  const { videoRef, error } = useCameraPreview(previewing, deviceId, media.refresh);

  return (
    <div className={layoutCss.section}>
      <h3 className={layoutCss.sectionTitle}>{t('settings.voice.cameraTitle')}</h3>
      <DeviceField
        label={t('settings.voice.camera')}
        devices={media.videoInputs}
        value={deviceId}
        onChange={(id) => select('videoinput', id)}
        note={
          devicesNeedPermission(media.videoInputs) ? t('settings.voice.allowCameraHint') : undefined
        }
      />
      <ToggleRow
        label={t('settings.voice.cameraPreview')}
        checked={previewing}
        onChange={setPreviewing}
      />
      {previewing && (
        <>
          {error && (
            <p className={css.errorText}>
              {error === 'denied'
                ? t('settings.voice.cameraDenied')
                : t('settings.voice.cameraFailed')}
            </p>
          )}
          {/* Stays mounted so a retry after an error still has an element to attach to. */}
          <video ref={videoRef} className={css.preview} hidden={!!error} muted playsInline />
        </>
      )}
    </div>
  );
}
