import type { DownloadProgress, MediaSource, WizardClient } from '@wizardchat/core';

/** No byte for this long after the first ones arrived: the download is stalled. */
export const DOWNLOAD_STALL_MS = 30_000;
/** The server may take a while to answer before the first byte (a big file it has to fetch). */
export const DOWNLOAD_START_MS = 60_000;

export class DownloadStalledError extends Error {
  constructor() {
    super('The download stalled');
    this.name = 'DownloadStalledError';
  }
}

let counter = 0;

/** A token for `cancelMediaDownload`, unique per download. */
function newToken(): string {
  counter += 1;
  return `dl-${Date.now().toString(36)}-${counter.toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export interface DownloadOptions {
  /** The size from the event, for the total when the browser can't read the server's length. */
  sizeHint?: number | null;
  onProgress?: (progress: DownloadProgress) => void;
  /** Aborting stops the download; the call then rejects with the core's `cancelled` error. */
  signal?: AbortSignal;
  /** Overrides for tests. */
  startMs?: number;
  stallMs?: number;
}

/**
 * Downloads (and decrypts) a message's media with the core, reporting progress. The download is
 * cancelled when `signal` aborts, and when it stalls: no bytes within `startMs` of the request, or
 * within `stallMs` after the last progress. Rejects with `DownloadStalledError` in that case.
 */
export async function downloadMedia(
  client: WizardClient,
  source: MediaSource,
  options: DownloadOptions = {}
): Promise<Uint8Array> {
  const { sizeHint = null, onProgress, signal, startMs = DOWNLOAD_START_MS } = options;
  const stallMs = options.stallMs ?? DOWNLOAD_STALL_MS;
  const token = newToken();
  let stalled = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const stop = () => {
    client.cancelMediaDownload(token).catch(() => {});
  };
  const arm = (ms: number) => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      stalled = true;
      stop();
    }, ms);
  };

  if (signal?.aborted) {
    stop();
  } else {
    signal?.addEventListener('abort', stop, { once: true });
  }
  arm(startMs);
  try {
    return await client.mediaDownload(source, sizeHint, token, (progress) => {
      arm(stallMs);
      onProgress?.(progress);
    });
  } catch (error) {
    if (stalled) throw new DownloadStalledError();
    throw error;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', stop);
  }
}

/** True for the error a cancelled download rejects with. */
export function isCancelled(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: unknown }).code === 'cancelled'
  );
}
