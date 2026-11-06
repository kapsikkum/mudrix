import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAtom, useAtomValue } from 'jotai';
import { MicrophoneIcon, StopIcon, WarningIcon } from '@phosphor-icons/react';
import { ToggleRow } from '@/app/components/Toggle';
import {
  autoGainControlAtom,
  callDevicesAtom,
  echoCancellationAtom,
  noiseSuppressionAtom,
} from '@/app/store/atoms';
import { useSelectDevice } from '@/app/features/calls/DeviceMenu';
import { isMobileDevice } from '@/app/util/platform';
import type { MediaDevices } from '@/util/mediaDevices';
import * as layoutCss from '../Settings.css';
import * as css from './VoiceAudio.css';
import { DeviceField, devicesNeedPermission } from './DeviceField';
import { useMicTest } from './useMicTest';

export function InputSection({ media }: { media: MediaDevices }) {
  const { t } = useTranslation();
  const devices = useAtomValue(callDevicesAtom);
  const { select } = useSelectDevice();
  const [noiseSuppression, setNoiseSuppression] = useAtom(noiseSuppressionAtom);
  const [echoCancellation, setEchoCancellation] = useAtom(echoCancellationAtom);
  const [autoGainControl, setAutoGainControl] = useAtom(autoGainControlAtom);
  const [hearYourself, setHearYourself] = useState(false);
  const deviceId = devices.audioinput ?? '';

  const test = useMicTest(
    { deviceId, noiseSuppression, echoCancellation, autoGainControl },
    hearYourself,
    devices.audiooutput ?? '',
    // Device names only become available once a stream has been opened.
    media.refresh
  );

  return (
    <div className={layoutCss.section}>
      <h3 className={layoutCss.sectionTitle}>{t('settings.voice.inputTitle')}</h3>
      {/* A phone has one microphone and the system picks it. */}
      {!isMobileDevice() && (
        <DeviceField
          label={t('settings.voice.microphone')}
          devices={media.audioInputs}
          value={deviceId}
          onChange={(id) => select('audioinput', id)}
          note={
            devicesNeedPermission(media.audioInputs) ? t('settings.voice.allowMicHint') : undefined
          }
        />
      )}

      <div className={css.buttonRow}>
        <button type="button" className={css.button} onClick={test.active ? test.stop : test.start}>
          {test.active ? <StopIcon size={16} /> : <MicrophoneIcon size={16} />}
          {test.active ? t('settings.voice.stopTest') : t('settings.voice.testMic')}
        </button>
      </div>
      {test.error && (
        <p className={css.errorText}>
          {test.error === 'denied' ? t('settings.voice.micDenied') : t('settings.voice.micFailed')}
        </p>
      )}
      {test.active && (
        <>
          <div ref={test.trackRef} className={css.meterTrack} data-clip="false">
            <div ref={test.barRef} className={css.meterBar} />
          </div>
          <div className={css.meterCaption}>
            <span>{t('settings.voice.meterHint')}</span>
            <span ref={test.clipRef} className={css.clipLabel} data-clip="false">
              {t('settings.voice.clipping')}
            </span>
          </div>
          <ToggleRow
            label={t('settings.voice.hearYourself')}
            description={t('settings.voice.hearYourselfNote')}
            checked={hearYourself}
            onChange={setHearYourself}
          />
          {hearYourself && (
            <p className={css.warningText}>
              <WarningIcon size={16} weight="fill" />
              {t('settings.voice.headphonesWarning')}
            </p>
          )}
        </>
      )}

      <ToggleRow
        label={t('settings.voice.noiseSuppression')}
        description={t('settings.voice.noiseSuppressionNote')}
        checked={noiseSuppression}
        onChange={setNoiseSuppression}
      />
      <ToggleRow
        label={t('settings.voice.echoCancellation')}
        description={t('settings.voice.echoCancellationNote')}
        checked={echoCancellation}
        onChange={setEchoCancellation}
      />
      <ToggleRow
        label={t('settings.voice.autoGainControl')}
        description={t('settings.voice.autoGainControlNote')}
        checked={autoGainControl}
        onChange={setAutoGainControl}
      />
      <p className={layoutCss.settingNote}>{t('settings.voice.processingNote')}</p>
    </div>
  );
}
