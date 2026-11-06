import { useEffect, useRef, useState } from 'react';

export type CameraPreviewError = 'denied' | 'failed';

async function openCamera(deviceId: string): Promise<MediaStream> {
  try {
    return await navigator.mediaDevices.getUserMedia({
      video: deviceId ? { deviceId: { exact: deviceId } } : true,
    });
  } catch (err) {
    const name = err instanceof DOMException ? err.name : '';
    // The saved camera is gone: fall back to the system default rather than failing.
    if (deviceId && (name === 'OverconstrainedError' || name === 'NotFoundError')) {
      return navigator.mediaDevices.getUserMedia({ video: true });
    }
    throw err;
  }
}

/** Shows the camera in a <video> while `enabled`; restarts on device change, stops on unmount. */
export function useCameraPreview(
  enabled: boolean,
  deviceId: string,
  onOpened: () => void
): {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  error: CameraPreviewError | null;
  /** True once frames are flowing; false while opening. */
  ready: boolean;
} {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<CameraPreviewError | null>(null);
  const [ready, setReady] = useState(false);
  const onOpenedRef = useRef(onOpened);
  onOpenedRef.current = onOpened;

  useEffect(() => {
    if (!enabled) return undefined;
    let cancelled = false;
    let opened: MediaStream | null = null;
    const video = videoRef.current;
    setError(null);
    setReady(false);
    openCamera(deviceId).then(
      (s) => {
        if (cancelled) {
          s.getTracks().forEach((tr) => tr.stop());
          return;
        }
        opened = s;
        if (video) {
          video.srcObject = s;
          video.play().catch(() => {});
        }
        setReady(true);
        onOpenedRef.current();
      },
      (err) => {
        if (cancelled) return;
        const name = err instanceof DOMException ? err.name : '';
        setError(name === 'NotAllowedError' || name === 'SecurityError' ? 'denied' : 'failed');
      }
    );
    return () => {
      cancelled = true;
      opened?.getTracks().forEach((tr) => tr.stop());
      if (video) video.srcObject = null;
      setReady(false);
    };
  }, [enabled, deviceId]);

  return { videoRef, error, ready };
}
