import { useCallback, useEffect, useState } from 'react';

export interface AudioProcessingOptions {
  noiseSuppression: boolean;
  echoCancellation: boolean;
  autoGainControl: boolean;
}

export interface AudioConstraintOptions extends AudioProcessingOptions {
  /** '' is the system default. */
  deviceId: string;
}

export function supportsOutputSelection(): boolean {
  return typeof HTMLMediaElement !== 'undefined' && 'setSinkId' in HTMLMediaElement.prototype;
}

export function audioConstraints(opts: AudioConstraintOptions): MediaTrackConstraints {
  return {
    ...(opts.deviceId ? { deviceId: { exact: opts.deviceId } } : {}),
    noiseSuppression: opts.noiseSuppression,
    echoCancellation: opts.echoCancellation,
    autoGainControl: opts.autoGainControl,
  };
}

/**
 * Open a microphone stream with the chosen device and processing. If the saved device is gone
 * (unplugged, or ids reset), retries on the system default instead of failing.
 */
export async function getAudioStream(
  opts: AudioConstraintOptions,
  extra: MediaTrackConstraints = {}
): Promise<MediaStream> {
  try {
    return await navigator.mediaDevices.getUserMedia({
      audio: { ...audioConstraints(opts), ...extra },
    });
  } catch (err) {
    const name = err instanceof DOMException ? err.name : '';
    if (opts.deviceId && (name === 'OverconstrainedError' || name === 'NotFoundError')) {
      return navigator.mediaDevices.getUserMedia({
        audio: { ...audioConstraints({ ...opts, deviceId: '' }), ...extra },
      });
    }
    throw err;
  }
}

export interface MediaDevices {
  audioInputs: MediaDeviceInfo[];
  audioOutputs: MediaDeviceInfo[];
  videoInputs: MediaDeviceInfo[];
  /** Re-list devices; call after getting a stream, as labels stay empty until permission is granted. */
  refresh: () => Promise<void>;
}

export function useMediaDevices(): MediaDevices {
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);

  const refresh = useCallback(async () => {
    try {
      setDevices(await navigator.mediaDevices.enumerateDevices());
    } catch {
      setDevices([]);
    }
  }, []);

  useEffect(() => {
    const md = navigator.mediaDevices;
    if (!md) return undefined;
    refresh();
    md.addEventListener('devicechange', refresh);
    return () => md.removeEventListener('devicechange', refresh);
  }, [refresh]);

  return {
    audioInputs: devices.filter((d) => d.kind === 'audioinput'),
    audioOutputs: devices.filter((d) => d.kind === 'audiooutput'),
    videoInputs: devices.filter((d) => d.kind === 'videoinput'),
    refresh,
  };
}
