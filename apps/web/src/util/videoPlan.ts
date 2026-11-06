/**
 * Planning for sending big videos, with no DOM or encoder dependence so the native apps can mirror
 * it as it is (same thresholds, same tiers, same arithmetic).
 *
 * Algorithm. A video is either sent untouched, or re-encoded to H.264 + AAC in an MP4 with the moov
 * atom first. `planCompression` decides how far it is shrunk for one of two targets:
 *
 *  - fixed: scale the short side down to 1080/720/480 and encode at that resolution's fixed bitrate
 *    (never above the source's own bitrate). Skipped when the source already has no more pixels than
 *    the target and a bitrate within 25% of it.
 *  - smart: skipped when the file already fits `maxBytes`. Otherwise take 90% of the byte budget,
 *    subtract 128 kbit/s of sound and spread the rest over the duration. Pick the sharpest tier
 *    (1080, 720, 480, 360 on the short side, never above the source) whose minimum bitrate fits
 *    that budget; spend `min(budget, tier cap)` on the picture (at least 150 kbit/s, never more
 *    than the source had). A clip too long for even the smallest tier keeps its own resolution
 *    (or the smallest tier, whichever is smaller) at the lowest bitrate.
 *
 * The encoder keeps the original when the result is not at least `MIN_SAVING` (15%) smaller.
 * Expected size = duration * (video bitrate + audio bitrate) / 8.
 */

export type FixedHeight = 1080 | 720 | 480;
/** What one attachment is sent as: untouched, shrunk to fit the size the settings aim for, or a fixed resolution. */
export type VideoQuality = 'original' | 'smart' | FixedHeight;
/** What the encoder is asked for: a size to fit under, or a resolution to scale down to. */
export type CompressTarget =
  { kind: 'smart'; maxBytes: number } | { kind: 'fixed'; height: FixedHeight };

/** What is known about a source video before it is encoded; `height` and `width` are as displayed. */
export interface VideoMeta {
  durationSec: number;
  width: number;
  height: number;
  /** Bits per second of the whole file, sound included. */
  bitrate: number;
}

export interface CompressPlan {
  /** Short side the video is scaled down to (never above its own). */
  height: number;
  /** Bits per second for the picture. */
  videoBitrate: number;
  estimatedBytes: number;
}

/** Resolution steps a smart plan picks from: each needs at least `min` bit/s to look decent, and gains nothing past `cap`. */
const TIERS = [
  { height: 1080, min: 3_500_000, cap: 6_000_000 },
  { height: 720, min: 1_800_000, cap: 3_000_000 },
  { height: 480, min: 800_000, cap: 1_500_000 },
  { height: 360, min: 400_000, cap: 800_000 },
] as const;
/** What a fixed resolution is encoded at. */
export const FIXED_BITRATE: Record<FixedHeight, number> = {
  1080: 5_000_000,
  720: 2_800_000,
  480: 1_400_000,
};
export const AUDIO_BITRATE = 128_000;
/** Lowest picture bitrate a smart plan will go to for a clip too long to fit otherwise. */
const MIN_VIDEO_BITRATE = 150_000;
/** Share of the size budget left for the picture and sound; the rest absorbs container overhead and rate overshoot. */
const BUDGET_SHARE = 0.9;
export const MAX_FRAME_RATE = 30;
/** The result is only worth sending if it is at least this much smaller than the original. */
export const MIN_SAVING = 0.15;

/**
 * How to re-encode a video for a target, or null when it should go as it is (it already fits, or
 * is already smaller than the target would make it).
 */
export function planCompression(meta: VideoMeta, target: CompressTarget): CompressPlan | null {
  const { durationSec, width, height } = meta;
  if (!(durationSec > 0) || !(width > 0) || !(height > 0)) return null;
  const shortSide = Math.min(width, height);
  const sourceVideoBitrate = Math.max(0, meta.bitrate - AUDIO_BITRATE);
  const estimate = (videoBitrate: number) => (durationSec * (videoBitrate + AUDIO_BITRATE)) / 8;

  if (target.kind === 'fixed') {
    const videoBitrate = FIXED_BITRATE[target.height];
    const fitsAlready =
      shortSide <= target.height &&
      (sourceVideoBitrate === 0 || sourceVideoBitrate <= videoBitrate * 1.25);
    if (fitsAlready) return null;
    const bitrate = Math.round(
      sourceVideoBitrate > 0 ? Math.min(videoBitrate, sourceVideoBitrate) : videoBitrate
    );
    return {
      height: Math.min(target.height, shortSide),
      videoBitrate: bitrate,
      estimatedBytes: estimate(bitrate),
    };
  }

  if ((meta.bitrate * durationSec) / 8 <= target.maxBytes) return null;
  const available = (target.maxBytes * 8 * BUDGET_SHARE) / durationSec - AUDIO_BITRATE;
  const smallest = TIERS[TIERS.length - 1];
  const tier =
    TIERS.find((candidate) => candidate.height <= shortSide && available >= candidate.min) ??
    (available >= smallest.min ? undefined : smallest);
  // Fewer pixels than even the smallest step has: keep them all and spend what is available on them.
  const stepHeight = tier?.height ?? shortSide;
  const cap = tier?.cap ?? smallest.cap;
  let videoBitrate = Math.max(MIN_VIDEO_BITRATE, Math.min(available, cap));
  if (sourceVideoBitrate > 0) videoBitrate = Math.min(videoBitrate, sourceVideoBitrate);
  videoBitrate = Math.round(videoBitrate);
  return {
    height: Math.min(stepHeight, shortSide),
    videoBitrate,
    estimatedBytes: estimate(videoBitrate),
  };
}

/** Rough size the video will have after being encoded for `target`; the original size when it is sent as it is. */
export function estimateCompressedSize(
  meta: VideoMeta,
  target: CompressTarget,
  originalSize: number
): number {
  const plan = planCompression(meta, target);
  return plan ? Math.min(plan.estimatedBytes, originalSize) : originalSize;
}

// ---- Settings -> what one video is sent as -------------------------------------------------

export type VideoUploadModeValue = 'original' | 'smart' | 'fixed';

export interface VideoUploadPrefs {
  mode: VideoUploadModeValue;
  height: FixedHeight;
  /** Largest size a smart upload aims for, before the server's limit is applied. */
  targetBytes: number;
  /** Videos smaller than this are never re-encoded. */
  minBytes: number;
}

/** Share of the server's limit a smart upload aims for, so a little overshoot still goes through. */
const SERVER_LIMIT_SHARE = 0.95;

/** The size a smart upload aims for: what the settings ask, but never beyond what the server takes. */
export function smartMaxBytes(prefs: VideoUploadPrefs, maxUploadBytes: number): number {
  return Math.floor(Math.min(prefs.targetBytes, maxUploadBytes * SERVER_LIMIT_SHARE));
}

/**
 * What a video is sent as when the user hasn't picked for it: untouched, unless the settings ask for
 * big videos to be shrunk or the server wouldn't take it otherwise.
 */
export function defaultVideoQuality(
  prefs: VideoUploadPrefs,
  size: number,
  maxUploadBytes: number,
  canCompress: boolean
): VideoQuality {
  if (!canCompress) return 'original';
  if (size > maxUploadBytes) return prefs.mode === 'fixed' ? prefs.height : 'smart';
  if (prefs.mode === 'original' || size < prefs.minBytes) return 'original';
  return prefs.mode === 'fixed' ? prefs.height : 'smart';
}

export function qualityTarget(
  quality: VideoQuality,
  prefs: VideoUploadPrefs,
  maxUploadBytes: number
): CompressTarget | undefined {
  if (quality === 'original') return undefined;
  if (quality === 'smart') return { kind: 'smart', maxBytes: smartMaxBytes(prefs, maxUploadBytes) };
  return { kind: 'fixed', height: quality };
}

const OFFERED_HEIGHTS: FixedHeight[] = [720, 480];
/** An option is only offered if it comes out at most this share of the original (the encoder wants 15% saved). */
const MIN_SAVING_RATIO = 0.85;

export interface VideoChoice {
  quality: VideoQuality;
  /** Expected size when sent this way; null while the video's own details aren't known yet. */
  size: number | null;
}

/**
 * What one video can be sent as, each with its expected size. Original is always first. Sizes the
 * video already fits in, or resolutions at or above its own, are left out as they'd change nothing.
 */
export function videoChoices(
  meta: VideoMeta | null,
  fileSize: number,
  prefs: VideoUploadPrefs,
  maxUploadBytes: number
): VideoChoice[] {
  const choices: VideoChoice[] = [{ quality: 'original', size: fileSize }];
  const heights = new Set<FixedHeight>(OFFERED_HEIGHTS);
  if (prefs.mode === 'fixed') heights.add(prefs.height);
  const qualities: VideoQuality[] = ['smart', ...[...heights].sort((a, b) => b - a)];
  for (const quality of qualities) {
    const target = qualityTarget(quality, prefs, maxUploadBytes);
    if (!target) continue;
    if (!meta) {
      choices.push({ quality, size: null });
      continue;
    }
    const plan = planCompression(meta, target);
    // The encoder keeps the original when it wouldn't be clearly smaller, so don't offer what saves nothing.
    if (plan && plan.estimatedBytes <= fileSize * MIN_SAVING_RATIO) {
      choices.push({ quality, size: plan.estimatedBytes });
    }
  }
  return choices;
}
