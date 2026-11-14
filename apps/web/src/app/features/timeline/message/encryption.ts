import { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { WizardClient } from '@wizardchat/core';
import type { DownloadProgress, MediaInfo, MediaSource } from '@wizardchat/core';
import { useSyncState } from '@/app/data';
import { useToast } from '@/app/hooks/useToast';
import { getErrorMessage } from '@/util/error';
import { getSafeMimeType } from '@/util/safeMimeType';
import {
  getMediaCacheKey,
  getCachedMedia,
  setCachedMedia,
  getCachedBlobUrl,
  setCachedBlobUrl,
  deleteCachedBlobUrl,
} from './mediaCache';
import { getMediaBlobUrl, plainMediaUrl } from './media';
import { fetchMediaBlobUrl, mediaBlobCacheKey } from '@/app/components/Avatar';
import { entryMedia, type EventEntry } from './entry';
import { downloadMedia, isCancelled } from './mediaDownload';
import { isTextCardFile } from './FilePreviewModal';

const DOWNLOAD_TIMEOUT_MS = 30000;
// Videos at or above this size (or of unknown size) wait for a click instead of downloading on render.
const MANUAL_VIDEO_MIN_BYTES = 8 * 1024 * 1024;

export interface ManualVideoLoad {
  /** True while the video is not loaded and waits for the user to start it (or is being fetched). */
  needsClick: boolean;
  /** The persistent cache is still being checked, so no button is offered yet. */
  checking: boolean;
  loading: boolean;
  /** How much of the download has arrived; null before the first report. */
  progress: DownloadProgress | null;
  /** The user started this download, so playback may begin as soon as it is ready. */
  autoPlay: boolean;
  start: () => void;
  cancel: () => void;
}

interface MediaTarget {
  source: MediaSource;
  key: string;
  mimeType?: string;
}

function encryptedTarget(source: MediaSource | null, mimeType?: string): MediaTarget | null {
  if (!source || !('file' in source)) return null;
  const file = source.file as { url?: unknown; iv?: unknown } | null;
  if (!file || typeof file.url !== 'string') return null;
  return {
    source,
    key: getMediaCacheKey({ url: file.url, iv: typeof file.iv === 'string' ? file.iv : '' }),
    mimeType,
  };
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error('Media download timed out')), ms);
    promise.then(
      (value) => {
        window.clearTimeout(timer);
        resolve(value);
      },
      (err: unknown) => {
        window.clearTimeout(timer);
        reject(err);
      }
    );
  });
}

/** The decrypted media from the in-memory or persistent cache, if it is in either. */
async function resolveCached(key: string): Promise<string | null> {
  const cachedUrl = getCachedBlobUrl(key);
  if (cachedUrl) return cachedUrl;

  const cached = await getCachedMedia(key);
  if (!cached) return null;
  const blobUrl = URL.createObjectURL(new Blob([cached.data], { type: cached.mimeType }));
  setCachedBlobUrl(key, blobUrl, cached.mimeType);
  return blobUrl;
}

async function storeDecrypted(target: MediaTarget, bytes: Uint8Array): Promise<string> {
  const type = getSafeMimeType(target.mimeType ?? '');
  const buffer = bytes.slice().buffer as ArrayBuffer;
  await setCachedMedia(target.key, buffer, type);
  const blobUrl = URL.createObjectURL(new Blob([buffer], { type }));
  setCachedBlobUrl(target.key, blobUrl, type);
  return blobUrl;
}

async function resolveEncrypted(
  client: WizardClient,
  target: MediaTarget,
  timeoutMs = DOWNLOAD_TIMEOUT_MS
): Promise<string> {
  const cachedUrl = await resolveCached(target.key);
  if (cachedUrl) return cachedUrl;

  const bytes = await withTimeout(client.media(target.source), timeoutMs);
  return storeDecrypted(target, bytes);
}

interface ProgressOptions {
  sizeHint?: number;
  onProgress: (progress: DownloadProgress) => void;
  signal: AbortSignal;
}

/** Like `resolveEncrypted` for a video the user asked for: progress, cancel, stall timeout. */
async function resolveEncryptedWithProgress(
  client: WizardClient,
  target: MediaTarget,
  options: ProgressOptions
): Promise<string> {
  const cachedUrl = await resolveCached(target.key);
  if (cachedUrl) return cachedUrl;
  return storeDecrypted(target, await downloadMedia(client, target.source, options));
}

/** The same for an unencrypted video, kept in the in-memory cache under its `mxc://` key. */
async function resolvePlainWithProgress(
  client: WizardClient,
  mxcUrl: string,
  mimeType: string | undefined,
  options: ProgressOptions
): Promise<string> {
  const key = mediaBlobCacheKey(mxcUrl);
  const cached = getCachedBlobUrl(key);
  if (cached) return cached;
  const bytes = await downloadMedia(client, { url: mxcUrl }, options);
  const sniffed = await WizardClient.sniffMimeType(bytes.subarray(0, 32)).catch(() => null);
  // Never trust a declared type: only known-safe ones reach the blob
  const type = getSafeMimeType(sniffed ?? mimeType ?? '');
  const blobUrl = URL.createObjectURL(new Blob([bytes as BlobPart], { type }));
  setCachedBlobUrl(key, blobUrl, type);
  return blobUrl;
}

export function useDecryptedMedia(
  event: EventEntry,
  client: WizardClient,
  enabled = true,
  showErrors = true
): {
  mediaSrc: string | null;
  thumbnailSrc: string | null;
  isDecrypting: boolean;
  hasFailed: boolean;
  setMediaSrc: (url: string) => void;
  /** Click-to-download state for videos; null for everything else. */
  videoLoad: ManualVideoLoad | null;
  /** `force` skips the in-memory blob URL cache (its URL may have been revoked). */
  requestFullRes: (force?: boolean) => Promise<string | null>;
} {
  const { t } = useTranslation();
  const toast = useToast();
  const syncState = useSyncState();
  const [mediaSrc, setMediaSrc_] = useState<string | null>(null);
  const [thumbnailSrc, setThumbnailSrc_] = useState<string | null>(null);
  const [isDecrypting, setIsDecrypting] = useState(false);
  const [hasFailed, setHasFailed] = useState(false);
  const [reconnectTick, setReconnectTick] = useState(0);
  const [manualRequested, setManualRequested] = useState(false);
  const [videoProgress, setVideoProgress] = useState<DownloadProgress | null>(null);
  // The cache key a deferred video was last found missing from the persistent cache under.
  const [missedKey, setMissedKey] = useState<string | null>(null);

  const eventId = event.eventId ?? event.itemKey;
  const failedRef = useRef(false);

  const setMediaSrc = useCallback((url: string | null) => setMediaSrc_(url), []);
  const setThumbnailSrc = useCallback((url: string | null) => setThumbnailSrc_(url), []);

  const media: MediaInfo | null = entryMedia(event);
  const type = event.content.type;
  const isImage = type === 'image';
  const isVideo = type === 'video';
  const fullMimeType = media?.mimetype ?? undefined;
  // A text file card reads its own first bytes (ranged) and fetches the whole file on demand
  const textCard =
    type === 'file' &&
    media !== null &&
    isTextCardFile(
      media.filename || 'file',
      fullMimeType,
      typeof media.size === 'number' && media.size >= 0 ? media.size : undefined
    );
  const fullTarget = encryptedTarget(media?.source ?? null, fullMimeType);
  const mxcUrl = plainMediaUrl(media?.source);

  const videoSize =
    isVideo && typeof media?.size === 'number' && media.size >= 0 ? media.size : undefined;
  const deferVideo = isVideo && (videoSize === undefined || videoSize >= MANUAL_VIDEO_MIN_BYTES);
  const videoCacheKey =
    deferVideo && !mediaSrc
      ? (fullTarget?.key ?? (mxcUrl ? mediaBlobCacheKey(mxcUrl) : null))
      : null;
  const videoCachedInMemory = videoCacheKey !== null && getCachedBlobUrl(videoCacheKey) !== null;
  // An encrypted video may still sit in the persistent cache: wait for that check before offering a click.
  const videoCacheMissed = fullTarget ? missedKey === fullTarget.key : true;
  const videoNeedsClick = enabled && videoCacheKey !== null && !videoCachedInMemory;

  const thumbSource = isImage || isVideo ? (media?.thumbnailSource ?? null) : null;
  const thumbTarget = encryptedTarget(thumbSource, fullMimeType);
  const thumbUrl = plainMediaUrl(thumbSource);

  const primaryTarget: MediaTarget | null = isImage && thumbTarget ? thumbTarget : fullTarget;
  const primaryCacheKey = primaryTarget?.key ?? null;
  const posterTarget: MediaTarget | null = isVideo ? thumbTarget : null;
  const posterCacheKey = posterTarget?.key ?? null;

  const primaryRef = useRef(primaryTarget);
  primaryRef.current = primaryTarget;
  const posterRef = useRef(posterTarget);
  posterRef.current = posterTarget;

  useEffect(() => {
    if (!enabled || textCard) return;
    const target = primaryRef.current;
    if (!target) {
      if (isImage && thumbUrl) {
        const cached = getMediaBlobUrl(thumbUrl, client, setMediaSrc);
        if (cached) setMediaSrc(cached);
      }
      return;
    }
    // Large videos wait for a click (or the cache check below) instead of downloading on render.
    if (deferVideo) return;
    if (mediaSrc) return;
    if (failedRef.current) return;

    let cancelled = false;
    (async () => {
      try {
        setIsDecrypting(true);
        setHasFailed(false);
        const url = await resolveEncrypted(client, target);
        if (cancelled) return;
        setMediaSrc(url);
      } catch (err) {
        if (cancelled) return;
        failedRef.current = true;
        setHasFailed(true);
        if (showErrors) {
          toast.error(t('timeline.decryptFailed', { error: getErrorMessage(err) }));
        }
      } finally {
        if (!cancelled) setIsDecrypting(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    eventId,
    client,
    enabled,
    textCard,
    primaryCacheKey,
    isImage,
    deferVideo,
    thumbUrl,
    mediaSrc,
    setMediaSrc,
    toast,
    t,
    showErrors,
    reconnectTick,
  ]);

  const fullTargetRef = useRef(fullTarget);
  fullTargetRef.current = fullTarget;
  const fullTargetKey = fullTarget?.key ?? null;

  // A deferred encrypted video that is already in the persistent cache needs no click.
  useEffect(() => {
    if (!enabled || !deferVideo || !fullTargetKey || mediaSrc) return;
    let cancelled = false;
    resolveCached(fullTargetKey)
      .then((url) => {
        if (cancelled) return;
        if (url) setMediaSrc(url);
        else setMissedKey(fullTargetKey);
      })
      .catch(() => {
        if (!cancelled) setMissedKey(fullTargetKey);
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, deferVideo, fullTargetKey, mediaSrc, setMediaSrc]);

  // The click-to-download of a deferred video; cancelling or leaving drops the result.
  useEffect(() => {
    if (!enabled || !deferVideo || !manualRequested || mediaSrc) return;
    let cancelled = false;
    const controller = new AbortController();
    const options: ProgressOptions = {
      sizeHint: videoSize,
      onProgress: (progress) => {
        if (!cancelled) setVideoProgress(progress);
      },
      signal: controller.signal,
    };
    setVideoProgress(null);
    (async () => {
      try {
        let url: string | null = null;
        const target = fullTargetRef.current;
        if (target) {
          url = await resolveEncryptedWithProgress(client, target, options);
        } else if (mxcUrl) {
          url = await resolvePlainWithProgress(client, mxcUrl, fullMimeType, options);
        }
        if (cancelled) return;
        if (url) setMediaSrc(url);
        else setManualRequested(false);
      } catch (err) {
        if (cancelled || isCancelled(err)) return;
        // Back to the play button so a click retries; failedRef stays untouched so it cannot block that.
        setManualRequested(false);
        toast.error(t('timeline.video.downloadFailed', { error: getErrorMessage(err) }));
      }
    })();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [
    enabled,
    deferVideo,
    manualRequested,
    mediaSrc,
    client,
    mxcUrl,
    videoSize,
    fullMimeType,
    setMediaSrc,
    toast,
    t,
  ]);

  useEffect(() => {
    if (!enabled) return;
    if (!isVideo) {
      setThumbnailSrc(null);
      return;
    }
    const target = posterRef.current;
    if (!target) {
      if (thumbUrl) {
        const cached = getMediaBlobUrl(thumbUrl, client, setThumbnailSrc);
        if (cached) setThumbnailSrc(cached);
      }
      return;
    }
    if (thumbnailSrc) return;
    if (failedRef.current) return;

    let cancelled = false;
    (async () => {
      try {
        setIsDecrypting(true);
        setHasFailed(false);
        const url = await resolveEncrypted(client, target);
        if (cancelled) return;
        setThumbnailSrc(url);
      } catch (err) {
        if (cancelled) return;
        failedRef.current = true;
        setHasFailed(true);
        if (showErrors) {
          toast.error(t('timeline.decryptFailed', { error: getErrorMessage(err) }));
        }
      } finally {
        if (!cancelled) setIsDecrypting(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    eventId,
    client,
    enabled,
    isVideo,
    posterCacheKey,
    thumbUrl,
    thumbnailSrc,
    setThumbnailSrc,
    toast,
    t,
    showErrors,
    reconnectTick,
  ]);

  useEffect(() => {
    if (syncState !== 'running' || !failedRef.current) return;
    failedRef.current = false;
    setHasFailed(false);
    setReconnectTick((n) => n + 1);
  }, [syncState]);

  // Full-resolution file on demand (lightbox / download), for encrypted and
  // unencrypted media alike.
  const fullRef = useRef(fullTarget);
  fullRef.current = fullTarget;
  const fullCacheKey = fullTarget?.key ?? null;
  const requestFullRes = useCallback(
    async (force = false): Promise<string | null> => {
      const target = fullRef.current;
      if (target && fullCacheKey) {
        if (force) deleteCachedBlobUrl(fullCacheKey);
        try {
          return await resolveEncrypted(client, target);
        } catch {
          return null;
        }
      }

      if (mxcUrl) {
        if (force) deleteCachedBlobUrl(mediaBlobCacheKey(mxcUrl));
        try {
          return await fetchMediaBlobUrl(mxcUrl, client, 1);
        } catch {
          return null;
        }
      }
      return null;
    },
    [client, fullCacheKey, mxcUrl]
  );

  // Cache entries are managed by mediaCache.ts: the in-memory blob URL cache
  // is an LRU (2000 entries) and the persistent decrypted-media store is
  // capped by size/count with LRU eviction and wiped on logout. We do NOT
  // remove the cache entry on unmount, doing so would destroy the pre-cached
  // blob URL for the sender's own media when the local echo is replaced by
  // the confirmed remote echo.

  const startVideo = useCallback(() => setManualRequested(true), []);
  const cancelVideo = useCallback(() => setManualRequested(false), []);
  const videoLoad: ManualVideoLoad | null = isVideo
    ? {
        needsClick: videoNeedsClick,
        checking: videoNeedsClick && !videoCacheMissed,
        loading: manualRequested,
        progress: manualRequested ? videoProgress : null,
        autoPlay: manualRequested,
        start: startVideo,
        cancel: cancelVideo,
      }
    : null;

  return {
    mediaSrc,
    thumbnailSrc,
    isDecrypting,
    hasFailed,
    setMediaSrc,
    videoLoad,
    requestFullRes,
  };
}
