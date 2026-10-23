import { encryptAttachment, decryptAttachment } from 'matrix-encrypt-attachment';
import type { IEncryptedFile } from 'matrix-encrypt-attachment';
import type { MatrixClient } from 'matrix-js-sdk';
import { getMediaCacheKey, setCachedBlobUrl } from './message/mediaCache';
import { probeIsAnimated, stillExportFormat } from './utils/imageAnimation';
import { mxcUrlToHttp } from '@/util/matrix/mxcUrl';

export type { IEncryptedFile };

// Only allow mime types the browser can safely render as a blob URL.
const ALLOWED_BLOB_MIMETYPES = [
  'image/jpeg',
  'image/gif',
  'image/png',
  'image/apng',
  'image/webp',
  'image/avif',
  'video/mp4',
  'video/webm',
  'video/ogg',
  'video/quicktime',
  'audio/mp4',
  'audio/webm',
  'audio/aac',
  'audio/mpeg',
  'audio/ogg',
  'audio/wave',
  'audio/wav',
  'audio/x-wav',
  'audio/x-pn-wav',
  'audio/flac',
  'audio/x-flac',
];

function getSafeMimeType(mime: string): string {
  if (!mime) return 'application/octet-stream';
  if (ALLOWED_BLOB_MIMETYPES.includes(mime.toLowerCase())) return mime;
  return 'application/octet-stream';
}

export interface UploadResult {
  url?: string;
  file?: IEncryptedFile & { url: string };
  thumbnailUrl?: string;
  thumbnailFile?: IEncryptedFile & { url: string };
  thumbnailInfo?: { w: number; h: number; mimetype: string; size: number };
  mediaWidth?: number;
  mediaHeight?: number;
  durationMs?: number;
  isAnimated?: boolean;
}

const MAX_THUMB_DIM = 800;

function fitWithinMax(w: number, h: number, max: number): { w: number; h: number } {
  const scale = Math.min(1, max / Math.max(w, h));
  return { w: Math.max(1, Math.round(w * scale)), h: Math.max(1, Math.round(h * scale)) };
}

async function createImageThumbnail(
  file: File
): Promise<{ blob: Blob | null; w: number; h: number } | null> {
  try {
    if (typeof createImageBitmap !== 'function') return null;
    if (file.type === 'image/svg+xml') {
      return null;
    }
    const bitmap = await createImageBitmap(file);
    const origW = bitmap.width;
    const origH = bitmap.height;
    const scale = Math.min(1, MAX_THUMB_DIM / Math.max(origW, origH));
    if (scale >= 1) {
      bitmap.close();
      return { blob: null, w: origW, h: origH };
    }
    const { w, h } = fitWithinMax(origW, origH, MAX_THUMB_DIM);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      bitmap.close();
      return null;
    }
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, stillExportFormat(file.type), 0.8)
    );
    if (!blob) return { blob: null, w: origW, h: origH };
    return { blob, w, h };
  } catch {
    return null;
  }
}

function waitForMediaEvent(
  target: HTMLMediaElement,
  event: string,
  timeoutMs = 6000
): Promise<void> {
  return new Promise((resolve, reject) => {
    let done = false;
    const finish = (fn: () => void) => () => {
      if (done) return;
      done = true;
      window.clearTimeout(timer);
      target.removeEventListener(event, onEvent);
      target.removeEventListener('error', onError);
      fn();
    };
    const onEvent = finish(() => resolve());
    const onError = finish(() => reject(new Error(`Media error while waiting for ${event}`)));
    const timer = window.setTimeout(() => {
      if (done) return;
      done = true;
      target.removeEventListener(event, onEvent);
      target.removeEventListener('error', onError);
      reject(new Error(`Timed out waiting for ${event}`));
    }, timeoutMs);
    target.addEventListener(event, onEvent);
    target.addEventListener('error', onError);
  });
}

async function createVideoThumbnail(file: File): Promise<{
  blob: Blob;
  w: number;
  h: number;
  videoWidth: number;
  videoHeight: number;
  durationMs: number;
} | null> {
  const url = URL.createObjectURL(file);
  const video = document.createElement('video');
  try {
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';
    video.src = url;
    await waitForMediaEvent(video, 'loadeddata');

    const duration = isFinite(video.duration) ? video.duration : 0;
    if (duration > 0) {
      const target = Math.min(1, duration * 0.1);
      if (video.currentTime < target) {
        try {
          video.currentTime = target;
          await waitForMediaEvent(video, 'seeked', 3000);
        } catch {
          // Fall through and draw the current frame instead of failing.
        }
      }
    }

    const vw = video.videoWidth;
    const vh = video.videoHeight;
    if (vw <= 0 || vh <= 0) return null;

    const { w, h } = fitWithinMax(vw, vh, MAX_THUMB_DIM);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0, w, h);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', 0.8)
    );
    if (!blob) return null;
    return { blob, w, h, videoWidth: vw, videoHeight: vh, durationMs: Math.round(duration * 1000) };
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
    video.removeAttribute('src');
    video.load();
  }
}

export type UploadPhase = 'encrypting' | 'uploading';

const RENDERABLE_IMAGE_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/apng',
  'image/webp',
  'image/avif',
]);

export async function uploadEncryptedFile(
  client: MatrixClient,
  roomId: string,
  file: File,
  onPhase?: (phase: UploadPhase) => void,
  onProgress?: (fraction: number) => void,
  abortController?: AbortController
): Promise<UploadResult> {
  const isEncryptedRoom = await client.getCrypto()?.isEncryptionEnabledInRoom(roomId);
  const fileType = file.type;

  let thumb: {
    blob: Blob | null;
    w: number;
    h: number;
    videoWidth?: number;
    videoHeight?: number;
    durationMs?: number;
  } | null = null;
  if (fileType.startsWith('video/')) {
    thumb = await createVideoThumbnail(file);
  } else if (RENDERABLE_IMAGE_TYPES.has(fileType)) {
    thumb = await createImageThumbnail(file);
  }

  if (!isEncryptedRoom) {
    onPhase?.('uploading');

    const [response, thumbResponse] = await Promise.all([
      client.uploadContent(file, {
        name: file.name,
        abortController,
        progressHandler: onProgress
          ? ({ loaded, total }: { loaded: number; total: number }) =>
              onProgress(total > 0 ? loaded / total : 0)
          : undefined,
      }),
      thumb?.blob
        ? client.uploadContent(new Blob([thumb.blob], { type: thumb.blob.type }), {
            name: `${file.name}-thumb`,
            type: thumb.blob.type,
            abortController,
          })
        : Promise.resolve(null),
    ]);

    let thumbnailUrl: string | undefined;
    let thumbnailInfo: { w: number; h: number; mimetype: string; size: number } | undefined;
    if (thumb && thumb.blob && thumbResponse && !abortController?.signal.aborted) {
      thumbnailUrl = thumbResponse.content_uri;
      thumbnailInfo = {
        w: thumb.w,
        h: thumb.h,
        mimetype: thumb.blob.type || stillExportFormat(fileType),
        size: thumb.blob.size,
      };
      setCachedBlobUrl(`mxc:${thumbnailUrl}`, URL.createObjectURL(thumb.blob), thumb.blob.type);
    }

    return {
      url: response.content_uri,
      thumbnailUrl,
      thumbnailInfo,
      mediaWidth: thumb?.videoWidth ?? thumb?.w,
      mediaHeight: thumb?.videoHeight ?? thumb?.h,
      durationMs: thumb?.durationMs,
      isAnimated: await probeIsAnimated(fileType, file),
    };
  }

  onPhase?.('encrypting');
  const data = await file.arrayBuffer();

  const { data: encryptedData, info } = await encryptAttachment(data);

  let thumbEncryptedData: ArrayBuffer | null = null;
  let thumbInfo: IEncryptedFile | null = null;
  if (thumb?.blob && !abortController?.signal.aborted) {
    const thumbResult = await encryptAttachment(await thumb.blob.arrayBuffer());
    thumbEncryptedData = thumbResult.data;
    thumbInfo = thumbResult.info;
  }

  if (abortController?.signal.aborted) throw new DOMException('Upload cancelled', 'AbortError');

  onPhase?.('uploading');
  const blob = new Blob([encryptedData], { type: 'application/octet-stream' });
  const thumbBlob = thumbEncryptedData
    ? new Blob([thumbEncryptedData], { type: 'application/octet-stream' })
    : null;

  const [response, thumbResponse] = await Promise.all([
    client.uploadContent(blob, {
      includeFilename: false,
      type: 'application/octet-stream',
      abortController,
      progressHandler: onProgress
        ? ({ loaded, total }: { loaded: number; total: number }) =>
            onProgress(total > 0 ? loaded / total : 0)
        : undefined,
    }),
    thumbBlob
      ? client.uploadContent(thumbBlob, {
          includeFilename: false,
          type: 'application/octet-stream',
          abortController,
        })
      : Promise.resolve(null),
  ]);

  const uploadedFile: IEncryptedFile & { url: string } = {
    ...info,
    url: response.content_uri,
  };

  let thumbnailFile: (IEncryptedFile & { url: string }) | undefined;
  let thumbnailInfo: { w: number; h: number; mimetype: string; size: number } | undefined;

  if (thumb && thumb.blob && thumbInfo && thumbResponse && !abortController?.signal.aborted) {
    thumbnailFile = { ...thumbInfo, url: thumbResponse.content_uri };
    thumbnailInfo = {
      w: thumb.w,
      h: thumb.h,
      mimetype: thumb.blob.type || stillExportFormat(fileType),
      size: thumb.blob.size,
    };

    const thumbKey = getMediaCacheKey(thumbnailFile);
    setCachedBlobUrl(thumbKey, URL.createObjectURL(thumb.blob), thumb.blob.type);
  }

  return {
    file: uploadedFile,
    thumbnailFile,
    thumbnailInfo,
    mediaWidth: thumb?.videoWidth ?? thumb?.w,
    mediaHeight: thumb?.videoHeight ?? thumb?.h,
    durationMs: thumb?.durationMs,
    isAnimated: await probeIsAnimated(fileType, file),
  };
}

export async function decryptMediaFile(
  client: MatrixClient,
  encryptedFile: IEncryptedFile & { url: string },
  mimeType?: string,
  signal?: AbortSignal
): Promise<Blob> {
  const httpUrl = mxcUrlToHttp(
    client,
    encryptedFile.url,
    undefined,
    undefined,
    undefined,
    false,
    true,
    true
  );
  if (!httpUrl) throw new Error(`Cannot resolve mxc URL: ${encryptedFile.url}`);

  // Download encrypted ciphertext
  const token = client.getAccessToken();
  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  headers['Accept-Encoding'] = 'identity';

  const response = await fetch(httpUrl, { headers, signal });
  if (!response.ok) {
    throw new Error(
      `Failed to download encrypted media: ${response.status} ${response.statusText}`
    );
  }

  const ciphertext = await response.arrayBuffer();

  // Decrypt
  const plaintext = await decryptAttachment(ciphertext, encryptedFile);

  // Return blob with a safe MIME type (prevents XSS from executable content)
  return new Blob([plaintext], { type: getSafeMimeType(mimeType ?? '') });
}

export function getEncryptedFile(
  content: Record<string, unknown>
): (IEncryptedFile & { url: string }) | null {
  const file = content?.file as Record<string, unknown> | undefined;
  if (!file || typeof file.url !== 'string') return null;
  return file as unknown as IEncryptedFile & { url: string };
}

export interface MediaThumbnail {
  file?: IEncryptedFile & { url: string };
  url?: string;
  mimetype?: string;
}

export function getMediaThumbnail(content: Record<string, unknown>): MediaThumbnail | null {
  const info = content?.info as Record<string, unknown> | undefined;
  if (!info) return null;
  const thumbInfo = info?.thumbnail_info as Record<string, unknown> | undefined;
  const mimetype = typeof thumbInfo?.mimetype === 'string' ? thumbInfo.mimetype : undefined;
  const encThumb = info?.thumbnail_file as Record<string, unknown> | undefined;
  if (encThumb && typeof encThumb.url === 'string') {
    return {
      file: encThumb as unknown as IEncryptedFile & { url: string },
      mimetype,
    };
  }
  const url = info?.thumbnail_url;
  if (typeof url === 'string') {
    return { url, mimetype };
  }
  return null;
}

export interface MediaInfo {
  mimetype: string;
  size: number;
  w?: number;
  h?: number;
  duration?: number;
}

export async function getImageDimensions(blob: Blob): Promise<{ w: number; h: number } | null> {
  try {
    if (typeof createImageBitmap !== 'function') return null;
    const bitmap = await createImageBitmap(blob);
    const dims = { w: bitmap.width, h: bitmap.height };
    bitmap.close();
    if (dims.w > 0 && dims.h > 0) return dims;
  } catch {
    // Not every image format decodes via createImageBitmap; fall back to no dimensions.
  }
  return null;
}

export function buildMediaMessageContent(
  msgtype: 'm.image' | 'm.video' | 'm.file' | 'm.audio',
  filename: string,
  body: string,
  uploadResult: UploadResult,
  info: MediaInfo
): Record<string, unknown> {
  const infoWithAnimation =
    typeof uploadResult.isAnimated === 'boolean'
      ? { ...info, is_animated: uploadResult.isAnimated }
      : info;
  const mergedInfo = uploadResult.thumbnailInfo
    ? uploadResult.thumbnailFile
      ? {
          ...infoWithAnimation,
          thumbnail_file: uploadResult.thumbnailFile,
          thumbnail_info: uploadResult.thumbnailInfo,
        }
      : uploadResult.thumbnailUrl
        ? {
            ...infoWithAnimation,
            thumbnail_url: uploadResult.thumbnailUrl,
            thumbnail_info: uploadResult.thumbnailInfo,
          }
        : infoWithAnimation
    : infoWithAnimation;
  const base = {
    msgtype,
    body,
    filename,
    info: mergedInfo,
  };

  if (uploadResult.file) {
    // Encrypted room — MSC3090 format
    return { ...base, file: uploadResult.file };
  }

  // Unencrypted room
  return { ...base, url: uploadResult.url };
}
