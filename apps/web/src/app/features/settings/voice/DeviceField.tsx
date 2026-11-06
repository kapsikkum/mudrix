import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Select } from '@/app/components/Select';
import * as layoutCss from '../Settings.css';
import * as css from './VoiceAudio.css';

interface DeviceFieldProps {
  label: string;
  devices: MediaDeviceInfo[];
  /** Saved device id; '' is the system default. */
  value: string;
  onChange: (deviceId: string) => void;
  /** Shown under the select, e.g. the permission hint. */
  note?: string;
}

/** A labelled device picker with a "Default" entry. */
export function DeviceField({ label, devices, value, onChange, note }: DeviceFieldProps) {
  const { t } = useTranslation();

  const options = useMemo(() => {
    // Before permission is granted, devices have no id; they cannot be picked yet.
    const named = devices.filter((d) => d.deviceId);
    const list = [
      { value: '', label: t('settings.voice.deviceDefault') },
      ...named.map((d, i) => ({
        value: d.deviceId,
        label: d.label || t('settings.voice.deviceUnnamed', { n: i + 1 }),
      })),
    ];
    // The saved device is not plugged in: keep showing it so the select is not blank.
    if (value && !named.some((d) => d.deviceId === value)) {
      list.push({ value, label: t('settings.voice.deviceUnavailable') });
    }
    return list;
  }, [devices, value, t]);

  return (
    <div className={css.fieldRow}>
      <div className={layoutCss.settingInfo}>
        <span className={layoutCss.settingLabel}>{label}</span>
        {note && <span className={layoutCss.settingNote}>{note}</span>}
      </div>
      <div className={css.fieldControl}>
        <div className={css.selectWrap}>
          <Select value={value} aria-label={label} options={options} onChange={onChange} />
        </div>
      </div>
    </div>
  );
}

/** True when the browser listed devices but hid their names (no permission granted yet). */
export function devicesNeedPermission(devices: MediaDeviceInfo[]): boolean {
  return devices.length > 0 && devices.every((d) => !d.label);
}
