import {
  FIXED_BITRATE,
  MAX_FRAME_RATE,
  MIN_SAVING,
  planCompression,
  type CompressTarget,
  type VideoMeta,
} from './videoPlan';

export * from './videoPlan';

let probe: Promise<boolean> | null = null;
let supported = false;

/**
 * Whether this webview can re-encode video: WebCodecs with an H.264 encoder. The check is async,
 * so this is false until `probeVideoCompression` (started by the first call) has finished.
 */
export function canCompressVideo(): boolean {
  void probeVideoCompression();
  return supported;
}

export function probeVideoCompression(): Promise<boolean> {
  probe ??= (async () => {
    if (
      typeof VideoEncoder === 'undefined' ||
      typeof VideoDecoder === 'undefined' ||
      typeof VideoFrame === 'undefined'
    ) {
      return false;
    }
    try {
      const { supported: ok } = await VideoEncoder.isConfigSupported({
        codec: 'avc1.640028',
        width: 1280,
        height: 720,
        bitrate: FIXED_BITRATE[720],
      });
      supported = ok === true;
    } catch {
      supported = false;
    }
    return supported;
  })();
  return probe;
}

/** Reads the length and picture size of a video file from its metadata. Null if it can't be read. */
export function readVideoMeta(file: File): Promise<VideoMeta | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    const done = (value: VideoMeta | null) => {
      video.removeAttribute('src');
      video.load();
      URL.revokeObjectURL(url);
      resolve(value);
    };
    video.preload = 'metadata';
    video.muted = true;
    video.onloadedmetadata = () => {
      const { duration, videoWidth, videoHeight } = video;
      done(
        Number.isFinite(duration) && duration > 0 && videoWidth > 0 && videoHeight > 0
          ? {
              durationSec: duration,
              width: videoWidth,
              height: videoHeight,
              bitrate: (file.size * 8) / duration,
            }
          : null
      );
    };
    video.onerror = () => done(null);
    video.src = url;
  });
}

function even(n: number): number {
  return Math.max(2, Math.round(n / 2) * 2);
}

function abortError(): DOMException {
  return new DOMException('Aborted', 'AbortError');
}

/**
 * Re-encodes a video to H.264 (hardware encoder where available) as an MP4 with the moov atom first,
 * so it can start playing before it has fully downloaded. How far it is shrunk comes from the target
 * and the video's own length and bitrate (`planCompression`). Audio is copied when the container
 * allows it, otherwise re-encoded. Resolves with the original file when re-encoding would not make it
 * at least ~15% smaller. Rejects with an AbortError DOMException when `signal` aborts.
 *
 * Native apps: use the platform's hardware H.264 encoder (MediaCodec / AVAssetWriter) with the plan
 * from `planCompression`: scale the short side to `plan.height`, `plan.videoBitrate` for the picture,
 * 30 fps cap, keyframe every 2 s, AAC audio, moov atom first.
 */
export async function compressVideo(
  file: File,
  opts: {
    target: CompressTarget;
    onProgress: (fraction: number) => void;
    signal: AbortSignal;
  }
): Promise<File> {
  const { target, onProgress, signal } = opts;
  if (signal.aborted) throw abortError();

  // Loaded on demand so it stays out of the main bundle.
  const {
    ALL_FORMATS,
    BlobSource,
    BufferTarget,
    Conversion,
    ConversionCanceledError,
    Input,
    Mp4OutputFormat,
    Output,
    Quality,
  } = await import('mediabunny');
  if (signal.aborted) throw abortError();

  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
  try {
    const track = await input.getPrimaryVideoTrack();
    if (!track) throw new Error('No video track');
    // Display size already has the rotation metadata applied.
    const displayW = await track.getDisplayWidth();
    const displayH = await track.getDisplayHeight();
    const durationSec = await input.computeDuration();
    const stats = await track.computePacketStats(200);
    const plan = planCompression(
      {
        durationSec,
        width: displayW,
        height: displayH,
        bitrate: durationSec > 0 ? (file.size * 8) / durationSec : 0,
      },
      target
    );
    if (!plan) return file;

    // The short side is what "720p" means, so a portrait video keeps its 9:16 shape.
    const shortSide = Math.min(displayW, displayH);
    const resize = shortSide > plan.height;
    const fastEnough = stats.averagePacketRate <= MAX_FRAME_RATE + 0.5;
    const scale = resize ? plan.height / shortSide : 1;
    const output = new Output({
      format: new Mp4OutputFormat({ fastStart: 'in-memory' }),
      target: new BufferTarget(),
    });
    const conversion = await Conversion.init({
      input,
      output,
      video: {
        ...(resize ? { width: even(displayW * scale), height: even(displayH * scale) } : {}),
        fit: 'contain',
        codec: 'avc',
        quality: new Quality({ bitrate: plan.videoBitrate }),
        ...(fastEnough ? {} : { frameRate: MAX_FRAME_RATE }),
        keyFrameInterval: 2,
        forceTranscode: true,
      },
      showWarnings: false,
    });
    if (!conversion.isValid) throw new Error('Video cannot be converted on this device');
    // Better to fall back to the original than to silently send the video without its sound.
    if (conversion.discardedTracks.some((d) => d.track.isAudioTrack())) {
      throw new Error('Audio cannot be converted on this device');
    }

    conversion.onProgress = (p) => onProgress(Math.min(1, Math.max(0, p)));
    const onAbort = () => void conversion.cancel();
    signal.addEventListener('abort', onAbort);
    try {
      await conversion.execute();
    } catch (err) {
      if (signal.aborted || err instanceof ConversionCanceledError) throw abortError();
      throw err;
    } finally {
      signal.removeEventListener('abort', onAbort);
    }
    if (signal.aborted) throw abortError();

    const buffer = output.target.buffer;
    if (!buffer || buffer.byteLength > file.size * (1 - MIN_SAVING)) return file;
    const dot = file.name.lastIndexOf('.');
    const base = dot > 0 ? file.name.slice(0, dot) : file.name;
    return new File([buffer], `${base}.mp4`, { type: 'video/mp4', lastModified: Date.now() });
  } finally {
    input.dispose();
  }
}
