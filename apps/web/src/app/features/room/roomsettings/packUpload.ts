import type { WizardClient } from '@wizardchat/core';
import { ROOM_PACK_TYPES } from '@/app/features/settings/emojis/imagePackTypes';
import { getImageDimensions } from '@/app/features/timeline/encryptedMedia';
import { probeIsAnimated } from '@/app/features/timeline/utils/imageAnimation';
import { MatrixErrorCode } from '@/util/error';

export interface UploadedImage {
  mxc: string;
  mimetype: string;
  info: Record<string, unknown>;
}

export interface PooledUploadResult {
  /** Same order as the input files; null where the upload failed or was cancelled. */
  uploaded: (UploadedImage | null)[];
  /** Failure message per input index. */
  errors: Map<number, string>;
  cancelled: boolean;
}

export interface PooledUploadOptions {
  concurrency?: number;
  signal?: AbortSignal;
  /**
   * Resume keys that already uploaded, so retry / resume only uploads what is missing. Filled
   * with every upload that succeeds.
   */
  done?: Map<string, UploadedImage>;
  onProgress?: (completed: number, total: number, failed: number) => void;
}

type ErrorLike = {
  httpStatus?: number;
  errcode?: string;
  code?: string;
  data?: { retry_after_ms?: number };
  getRetryAfterMs?: () => number | null;
  message?: string;
};

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    return `{${Object.keys(obj)
      .filter((k) => obj[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

export function sameContent(a: unknown, b: unknown): boolean {
  return stableStringify(a) === stableStringify(b);
}

export const fileResumeKey = (f: Pick<File, 'name' | 'size' | 'lastModified'>): string =>
  `${f.name}:${f.size}:${f.lastModified}`;

/** Shortcode derived from a file name (letters, digits, - and _ only). */
export function shortcodeFromFile(fileName: string, fallback = 'image'): string {
  return (
    fileName
      .replace(/\.[^.]+$/, '')
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '') || fallback
  );
}

function isRateLimited(err: unknown): err is ErrorLike {
  const e = err as ErrorLike | null;
  return (
    !!e &&
    (e.errcode === MatrixErrorCode.LIMIT_EXCEEDED ||
      e.code === MatrixErrorCode.LIMIT_EXCEEDED ||
      e.httpStatus === 429)
  );
}

function retryAfterMs(err: ErrorLike, attempt: number): number {
  let ms: number | null = null;
  try {
    ms = err.getRetryAfterMs?.() ?? err.data?.retry_after_ms ?? null;
  } catch {
    ms = null;
  }
  const fallback = 1000 * 2 ** attempt;
  return Math.min(Math.max(ms ?? fallback, 250), 30_000);
}

function abortError(): Error {
  return new DOMException('Aborted', 'AbortError');
}

function abortableSleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortError());
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      reject(abortError());
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

export interface RetryOptions {
  attempts?: number;
  /** Injected in tests, so retries do not really wait. */
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
}

/** Retries on 429 honouring the server's Retry-After (capped), up to `attempts` tries. */
export async function withRateLimitRetry<T>(
  fn: () => Promise<T>,
  signal?: AbortSignal,
  opts: RetryOptions = {}
): Promise<T> {
  const { attempts = 4, sleep = abortableSleep } = opts;
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await fn();
    } catch (err) {
      if (!isRateLimited(err) || attempt >= attempts - 1 || signal?.aborted) throw err;
      await sleep(retryAfterMs(err, attempt), signal);
    }
  }
}

/**
 * Sends the pack to both the unstable and the stable event type, skipping any type whose current
 * room state already has identical content (incremental save: a no-op edit sends nothing).
 * Returns the number of events actually sent.
 */
export async function sendPackStateEvents(
  client: WizardClient,
  roomId: string,
  stateKey: string,
  content: Record<string, unknown>,
  signal?: AbortSignal
): Promise<number> {
  const current = await Promise.all(
    ROOM_PACK_TYPES.map((type) => client.stateEvent(roomId, type, stateKey).catch(() => null))
  );
  const toSend = ROOM_PACK_TYPES.filter((_, i) => !sameContent(current[i], content));
  await Promise.all(
    toSend.map((type) =>
      withRateLimitRetry(() => client.setStateEvent(roomId, type, stateKey, content), signal)
    )
  );
  return toSend.length;
}

/** Uploads one file and reads what the event needs to know about it. */
export async function uploadPackFile(
  client: WizardClient,
  file: File,
  signal?: AbortSignal
): Promise<UploadedImage> {
  const mimetype = file.type || 'image/png';
  const [mxc, dims, isAnimated] = await Promise.all([
    withRateLimitRetry(async () => {
      if (signal?.aborted) throw abortError();
      const data = new Uint8Array(await file.arrayBuffer());
      if (signal?.aborted) throw abortError();
      return client.uploadMedia(data, mimetype);
    }, signal),
    getImageDimensions(file),
    probeIsAnimated(mimetype, file),
  ]);
  return {
    mxc,
    mimetype,
    info: {
      ...(dims ? { w: dims.w, h: dims.h } : {}),
      size: file.size,
      mimetype,
      ...(isAnimated !== undefined ? { is_animated: isAnimated } : {}),
    },
  };
}

/**
 * Uploads files with bounded concurrency. `done` maps resumeKey -> result of a previous attempt;
 * those files are not uploaded again, which is what makes retry / resume cheap.
 */
export async function uploadFilesPooled(
  files: File[],
  upload: (file: File, signal?: AbortSignal) => Promise<UploadedImage>,
  opts: PooledUploadOptions = {}
): Promise<PooledUploadResult> {
  const { concurrency = 4, signal, done = new Map<string, UploadedImage>(), onProgress } = opts;
  const uploaded: (UploadedImage | null)[] = new Array(files.length).fill(null);
  const errors = new Map<number, string>();
  let completed = 0;
  let next = 0;

  files.forEach((file, i) => {
    const hit = done.get(fileResumeKey(file));
    if (hit) {
      uploaded[i] = hit;
      completed += 1;
    }
  });
  onProgress?.(completed, files.length, 0);

  const worker = async () => {
    for (;;) {
      if (signal?.aborted) return;
      const i = next;
      next += 1;
      if (i >= files.length) return;
      if (uploaded[i]) continue;
      try {
        const res = await upload(files[i], signal);
        uploaded[i] = res;
        done.set(fileResumeKey(files[i]), res);
      } catch (err) {
        if (signal?.aborted) return;
        errors.set(i, err instanceof Error ? err.message : String(err));
      }
      completed += 1;
      onProgress?.(completed, files.length, errors.size);
    }
  };

  await Promise.all(Array.from({ length: Math.min(concurrency, files.length) }, worker));
  return { uploaded, errors, cancelled: !!signal?.aborted };
}
