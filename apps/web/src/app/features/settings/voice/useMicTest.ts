import { useEffect, useRef, useState } from 'react';
import { getAudioStream, type AudioConstraintOptions } from '@/util/mediaDevices';
import { routeToOutput } from '@/util/notificationSounds';

/** Signal below this (dBFS) shows as an empty meter. */
const FLOOR_DB = -60;
/** How long the clip warning stays lit after the signal last hit full scale. */
const CLIP_HOLD_MS = 1000;

export type MicTestError = 'denied' | 'failed';

export interface MicTest {
  active: boolean;
  error: MicTestError | null;
  start: () => void;
  stop: () => void;
  /** Attach to the meter bar (scaled 0-1) and its track (data-clip). Updated outside React. */
  barRef: React.RefObject<HTMLDivElement | null>;
  trackRef: React.RefObject<HTMLDivElement | null>;
  clipRef: React.RefObject<HTMLSpanElement | null>;
}

/**
 * Live microphone test. While active, the stream is opened with the given device and processing and
 * reopened whenever any of them change; everything is torn down on stop and on unmount.
 */
export function useMicTest(
  opts: AudioConstraintOptions,
  hearYourself: boolean,
  outputDevice: string,
  onOpened: () => void
): MicTest {
  const [active, setActive] = useState(false);
  const [error, setError] = useState<MicTestError | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const clipRef = useRef<HTMLSpanElement>(null);
  const onOpenedRef = useRef(onOpened);
  onOpenedRef.current = onOpened;

  const { deviceId, noiseSuppression, echoCancellation, autoGainControl } = opts;

  // Open (and reopen) the stream.
  useEffect(() => {
    if (!active) return undefined;
    let cancelled = false;
    let opened: MediaStream | null = null;
    setError(null);
    getAudioStream({ deviceId, noiseSuppression, echoCancellation, autoGainControl }).then(
      (s) => {
        if (cancelled) {
          s.getTracks().forEach((tr) => tr.stop());
          return;
        }
        opened = s;
        setStream(s);
        onOpenedRef.current();
      },
      (err) => {
        if (cancelled) return;
        const name = err instanceof DOMException ? err.name : '';
        setError(name === 'NotAllowedError' || name === 'SecurityError' ? 'denied' : 'failed');
        setActive(false);
      }
    );
    return () => {
      cancelled = true;
      opened?.getTracks().forEach((tr) => tr.stop());
      setStream(null);
    };
  }, [active, deviceId, noiseSuppression, echoCancellation, autoGainControl]);

  // Level meter.
  useEffect(() => {
    if (!stream) return undefined;
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return undefined;
    const ctx = new Ctor();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    const source = ctx.createMediaStreamSource(stream);
    source.connect(analyser);
    ctx.resume().catch(() => {});
    const samples = new Float32Array(analyser.fftSize);

    let raf = 0;
    let level = 0;
    let clipUntil = 0;
    let clipShown = false;
    const tick = () => {
      analyser.getFloatTimeDomainData(samples);
      let sum = 0;
      let peak = 0;
      for (let i = 0; i < samples.length; i += 1) {
        const v = Math.abs(samples[i]);
        sum += v * v;
        if (v > peak) peak = v;
      }
      const rms = Math.sqrt(sum / samples.length);
      const db = rms > 0 ? 20 * Math.log10(rms) : FLOOR_DB;
      const target = Math.min(1, Math.max(0, (db - FLOOR_DB) / -FLOOR_DB));
      // Rise quickly, fall slowly.
      level = target > level ? level + (target - level) * 0.6 : level + (target - level) * 0.12;
      const now = performance.now();
      if (peak >= 0.99) clipUntil = now + CLIP_HOLD_MS;
      const clipping = now < clipUntil;
      if (barRef.current) barRef.current.style.transform = `scaleX(${level.toFixed(3)})`;
      if (clipping !== clipShown) {
        clipShown = clipping;
        const value = String(clipping);
        trackRef.current?.setAttribute('data-clip', value);
        clipRef.current?.setAttribute('data-clip', value);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    const bar = barRef.current;
    const track = trackRef.current;
    const clip = clipRef.current;
    return () => {
      cancelAnimationFrame(raf);
      source.disconnect();
      ctx.close().catch(() => {});
      if (bar) bar.style.transform = 'scaleX(0)';
      track?.setAttribute('data-clip', 'false');
      clip?.setAttribute('data-clip', 'false');
    };
  }, [stream]);

  // Play the processed signal back so the effect of the settings can be heard.
  useEffect(() => {
    if (!stream || !hearYourself) return undefined;
    const audio = new Audio();
    audio.srcObject = stream;
    routeToOutput(audio);
    audio.play().catch(() => {});
    return () => {
      audio.pause();
      audio.srcObject = null;
    };
  }, [stream, hearYourself, outputDevice]);

  return {
    active,
    error,
    start: () => setActive(true),
    stop: () => setActive(false),
    barRef,
    trackRef,
    clipRef,
  };
}
