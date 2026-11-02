import { useCallback, useEffect, useRef, useState } from 'react';
import Recorder from 'opus-recorder';
import encoderPath from 'opus-recorder/dist/encoderWorker.min.js?url';

export const VOICE_MAX_DURATION_MS = 15 * 60 * 1000;
export const VOICE_WARN_REMAINING_MS = 10 * 1000;
export const VOICE_MIMETYPE = 'audio/ogg';

const LEVEL_SAMPLE_MS = 50;
const MAX_LIVE_SAMPLES = 60;
const MAX_WAVEFORM_BARS = 120;
const MIN_WAVEFORM_BARS = 8;

export type VoiceRecorderStatus = 'idle' | 'starting' | 'recording' | 'paused' | 'stopped';
export type VoiceRecorderError = 'unsupported' | 'permission' | 'failed' | null;

export interface VoiceRecorderState {
  supported: boolean;
  status: VoiceRecorderStatus;
  error: VoiceRecorderError;
  elapsedMs: number;
  liveLevels: number[];
  blob: Blob | null;
  durationMs: number;
  waveform: number[];
  previewUrl: string | null;
  start: () => Promise<void>;
  stop: () => Promise<void>;
  pause: () => void;
  resume: () => void;
  cancel: () => void;
  reset: () => void;
}

function buildWaveform(samples: number[], durationMs: number): number[] {
  if (samples.length === 0) return [];
  const durationSec = durationMs / 1000;
  const bars = Math.max(
    MIN_WAVEFORM_BARS,
    Math.min(MAX_WAVEFORM_BARS, Math.round(durationSec * 4))
  );
  const bucket = samples.length / bars;
  const out: number[] = [];
  for (let i = 0; i < bars; i++) {
    const start = Math.floor(i * bucket);
    const end = Math.max(start + 1, Math.floor((i + 1) * bucket));
    let max = 0;
    for (let j = start; j < end && j < samples.length; j++) {
      if (samples[j] > max) max = samples[j];
    }
    out.push(Math.round(Math.min(1, max) * 1024));
  }
  return out;
}

function createAudioContext(): AudioContext {
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) throw new Error('Web Audio API is not supported');
  return new Ctor();
}

export function useVoiceRecorder(): VoiceRecorderState {
  const [supported] = useState(() => {
    try {
      return (
        Recorder.isRecordingSupported() &&
        typeof navigator !== 'undefined' &&
        !!navigator.mediaDevices?.getUserMedia
      );
    } catch {
      return false;
    }
  });

  const [status, setStatus] = useState<VoiceRecorderStatus>('idle');
  const [error, setError] = useState<VoiceRecorderError>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [liveLevels, setLiveLevels] = useState<number[]>([]);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [durationMs, setDurationMs] = useState(0);
  const [waveform, setWaveform] = useState<number[]>([]);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const streamRef = useRef<MediaStream | null>(null);
  const contextRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const analyserDataRef = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const recorderRef = useRef<Recorder | null>(null);
  const intervalRef = useRef<number | null>(null);
  const buffersRef = useRef<ArrayBuffer[]>([]);
  const amplitudesRef = useRef<number[]>([]);
  const liveRef = useRef<number[]>([]);
  const previewUrlRef = useRef<string | null>(null);

  const statusRef = useRef<VoiceRecorderStatus>('idle');
  const elapsedRef = useRef(0);
  const lastTickRef = useRef(0);
  const stoppingRef = useRef(false);

  const updateStatus = useCallback((next: VoiceRecorderStatus) => {
    statusRef.current = next;
    setStatus(next);
  }, []);

  const clearIntervalTick = useCallback(() => {
    if (intervalRef.current !== null) {
      window.clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const releaseAudio = useCallback(() => {
    clearIntervalTick();
    const recorder = recorderRef.current;
    recorderRef.current = null;
    if (recorder) {
      try {
        void recorder.close();
      } catch {
        // already closed
      }
    }
    try {
      sourceRef.current?.disconnect();
    } catch {
      // not connected
    }
    try {
      analyserRef.current?.disconnect();
    } catch {
      // not connected
    }
    sourceRef.current = null;
    analyserRef.current = null;
    analyserDataRef.current = null;
    const context = contextRef.current;
    contextRef.current = null;
    if (context && context.state !== 'closed') {
      context.close().catch(() => {});
    }
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, [clearIntervalTick]);

  const sampleLevel = useCallback((): number => {
    const analyser = analyserRef.current;
    if (!analyser) return 0;
    let data = analyserDataRef.current;
    if (!data || data.length !== analyser.fftSize) {
      data = new Uint8Array(analyser.fftSize);
      analyserDataRef.current = data;
    }
    analyser.getByteTimeDomainData(data);
    let sumSq = 0;
    for (let i = 0; i < data.length; i++) {
      const v = (data[i] - 128) / 128;
      sumSq += v * v;
    }
    const rms = Math.sqrt(sumSq / data.length);
    return Math.min(1, rms * 2.4);
  }, []);

  const stopRef = useRef<(() => Promise<void>) | null>(null);

  const tick = useCallback(() => {
    const now = performance.now();
    const last = lastTickRef.current || now;
    lastTickRef.current = now;

    if (statusRef.current === 'recording') {
      elapsedRef.current += now - last;
      if (elapsedRef.current >= VOICE_MAX_DURATION_MS) {
        elapsedRef.current = VOICE_MAX_DURATION_MS;
        void stopRef.current?.();
      }
    }

    const level = statusRef.current === 'recording' ? sampleLevel() : 0;
    if (statusRef.current === 'recording') {
      amplitudesRef.current.push(level);
      const live = liveRef.current;
      live.push(level);
      if (live.length > MAX_LIVE_SAMPLES) live.splice(0, live.length - MAX_LIVE_SAMPLES);
    }

    setElapsedMs(elapsedRef.current);
    setLiveLevels([...liveRef.current]);
  }, [sampleLevel]);

  const stop = useCallback(async () => {
    const recorder = recorderRef.current;
    if (!recorder || stoppingRef.current) return;
    stoppingRef.current = true;
    clearIntervalTick();
    updateStatus('stopped');

    try {
      await recorder.stop();
    } catch {
      // Encoder may already be torn down; still flush whatever we captured.
    }

    const recordedMs =
      recorder.encodedSamplePosition > 0
        ? (recorder.encodedSamplePosition / 48000) * 1000
        : elapsedRef.current;
    const recorded = Math.max(0, Math.round(recordedMs));
    const finalWaveform = buildWaveform(amplitudesRef.current, recorded);
    const output = new Blob(buffersRef.current, { type: VOICE_MIMETYPE });

    releaseAudio();

    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    const url = output.size > 0 ? URL.createObjectURL(output) : null;
    previewUrlRef.current = url;

    setBlob(output.size > 0 ? output : null);
    setDurationMs(recorded);
    setWaveform(finalWaveform);
    setPreviewUrl(url);
    setLiveLevels([]);
    setElapsedMs(recorded);
    stoppingRef.current = false;
  }, [clearIntervalTick, releaseAudio, updateStatus]);

  stopRef.current = stop;

  const start = useCallback(async () => {
    if (
      !supported ||
      statusRef.current === 'recording' ||
      statusRef.current === 'starting' ||
      stoppingRef.current
    ) {
      return;
    }

    setError(null);
    setBlob(null);
    setPreviewUrl(null);
    setDurationMs(0);
    setWaveform([]);
    setLiveLevels([]);
    setElapsedMs(0);
    buffersRef.current = [];
    amplitudesRef.current = [];
    liveRef.current = [];
    elapsedRef.current = 0;

    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }

    updateStatus('starting');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      streamRef.current = stream;

      const context = createAudioContext();
      contextRef.current = context;
      if (context.state === 'suspended') await context.resume();

      const source = context.createMediaStreamSource(stream);
      sourceRef.current = source;

      const analyser = context.createAnalyser();
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0.4;
      source.connect(analyser);
      analyserRef.current = analyser;

      const recorder = new Recorder({
        sourceNode: source,
        encoderPath,
        numberOfChannels: 1,
        encoderSampleRate: 48000,
        encoderApplication: 2048,
        encoderBitRate: 24000,
        encoderFrameSize: 20,
        encoderComplexity: 5,
        resampleQuality: 3,
        streamPages: true,
        monitorGain: 0,
        recordingGain: 1,
      });
      recorder.ondataavailable = (data: ArrayBuffer) => {
        buffersRef.current.push(data);
      };
      recorderRef.current = recorder;

      await recorder.start();

      lastTickRef.current = performance.now();
      updateStatus('recording');
      intervalRef.current = window.setInterval(tick, LEVEL_SAMPLE_MS);
    } catch (err) {
      releaseAudio();
      updateStatus('idle');
      const name = err instanceof DOMException ? err.name : '';
      setError(name === 'NotAllowedError' || name === 'SecurityError' ? 'permission' : 'failed');
    }
  }, [supported, tick, releaseAudio, updateStatus]);

  const pause = useCallback(() => {
    const recorder = recorderRef.current;
    if (!recorder || statusRef.current !== 'recording') return;
    try {
      recorder.pause();
    } catch {
      return;
    }
    updateStatus('paused');
  }, [updateStatus]);

  const resume = useCallback(() => {
    const recorder = recorderRef.current;
    if (!recorder || statusRef.current !== 'paused') return;
    try {
      recorder.resume();
    } catch {
      return;
    }
    lastTickRef.current = performance.now();
    updateStatus('recording');
  }, [updateStatus]);

  const cancel = useCallback(() => {
    clearIntervalTick();
    releaseAudio();
    buffersRef.current = [];
    amplitudesRef.current = [];
    liveRef.current = [];
    elapsedRef.current = 0;
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
    setBlob(null);
    setPreviewUrl(null);
    setDurationMs(0);
    setWaveform([]);
    setLiveLevels([]);
    setElapsedMs(0);
    setError(null);
    updateStatus('idle');
  }, [clearIntervalTick, releaseAudio, updateStatus]);

  const reset = useCallback(() => {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
    setBlob(null);
    setPreviewUrl(null);
    setDurationMs(0);
    setWaveform([]);
    setLiveLevels([]);
    setElapsedMs(0);
    setError(null);
    updateStatus('idle');
  }, [updateStatus]);

  useEffect(() => {
    return () => {
      clearIntervalTick();
      releaseAudio();
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current);
        previewUrlRef.current = null;
      }
    };
  }, [clearIntervalTick, releaseAudio]);

  return {
    supported,
    status,
    error,
    elapsedMs,
    liveLevels,
    blob,
    durationMs,
    waveform,
    previewUrl,
    start,
    stop,
    pause,
    resume,
    cancel,
    reset,
  };
}
