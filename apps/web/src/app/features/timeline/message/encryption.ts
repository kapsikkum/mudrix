import { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import type { MediaInfo, MediaSource, WizardClient } from '@wizardchat/core';
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
} from './mediaCache';
import { getMediaBlobUrl, plainMediaUrl } from './media';
import { fetchMediaBlobUrl } from '@/app/components/Avatar';
import { entryMedia, type EventEntry } from './entry';

const DOWNLOAD_TIMEOUT_MS = 30000;

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

async function resolveEncrypted(client: WizardClient, target: MediaTarget): Promise<string> {
  const cachedUrl = getCachedBlobUrl(target.key);
  if (cachedUrl) return cachedUrl;

  const cached = await getCachedMedia(target.key);
  if (cached) {
    const blobUrl = URL.createObjectURL(new Blob([cached.data], { type: cached.mimeType }));
    setCachedBlobUrl(target.key, blobUrl, cached.mimeType);
    return blobUrl;
  }

  const bytes = await withTimeout(client.media(target.source), DOWNLOAD_TIMEOUT_MS);
  const type = getSafeMimeType(target.mimeType ?? '');
  const buffer = bytes.slice().buffer as ArrayBuffer;
  await setCachedMedia(target.key, buffer, type);
  const blobUrl = URL.createObjectURL(new Blob([buffer], { type }));
  setCachedBlobUrl(target.key, blobUrl, type);
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
  requestFullRes: () => Promise<string | null>;
} {
  const { t } = useTranslation();
  const toast = useToast();
  const syncState = useSyncState();
  const [mediaSrc, setMediaSrc_] = useState<string | null>(null);
  const [thumbnailSrc, setThumbnailSrc_] = useState<string | null>(null);
  const [isDecrypting, setIsDecrypting] = useState(false);
  const [hasFailed, setHasFailed] = useState(false);
  const [reconnectTick, setReconnectTick] = useState(0);

  const eventId = event.eventId ?? event.itemKey;
  const failedRef = useRef(false);

  const setMediaSrc = useCallback((url: string | null) => setMediaSrc_(url), []);
  const setThumbnailSrc = useCallback((url: string | null) => setThumbnailSrc_(url), []);

  const media: MediaInfo | null = entryMedia(event);
  const type = event.content.type;
  const isImage = type === 'image';
  const isVideo = type === 'video';
  const fullMimeType = media?.mimetype ?? undefined;
  const fullTarget = encryptedTarget(media?.source ?? null, fullMimeType);
  const mxcUrl = plainMediaUrl(media?.source);

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
    if (!enabled) return;
    const target = primaryRef.current;
    if (!target) {
      if (isImage && thumbUrl) {
        const cached = getMediaBlobUrl(thumbUrl, client, setMediaSrc);
        if (cached) setMediaSrc(cached);
      }
      return;
    }
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
    primaryCacheKey,
    isImage,
    thumbUrl,
    mediaSrc,
    setMediaSrc,
    toast,
    t,
    showErrors,
    reconnectTick,
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
  const requestFullRes = useCallback(async (): Promise<string | null> => {
    const target = fullRef.current;
    if (target && fullCacheKey) {
      try {
        return await resolveEncrypted(client, target);
      } catch {
        return null;
      }
    }

    if (mxcUrl) {
      try {
        return await fetchMediaBlobUrl(mxcUrl, client, 1);
      } catch {
        return null;
      }
    }
    return null;
  }, [client, fullCacheKey, mxcUrl]);

  // Cache entries are managed by mediaCache.ts: the in-memory blob URL cache
  // is an LRU (2000 entries) and the persistent decrypted-media store is
  // capped by size/count with LRU eviction and wiped on logout. We do NOT
  // remove the cache entry on unmount, doing so would destroy the pre-cached
  // blob URL for the sender's own media when the local echo is replaced by
  // the confirmed remote echo.

  return { mediaSrc, thumbnailSrc, isDecrypting, hasFailed, setMediaSrc, requestFullRes };
}
