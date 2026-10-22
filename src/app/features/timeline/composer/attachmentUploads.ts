import { useSyncExternalStore } from 'react';
import type { MatrixClient } from 'matrix-js-sdk';
import { uploadEncryptedFile, type UploadResult } from '../encryptedMedia';

export type AttachmentUploadStatus = 'uploading' | 'done' | 'error';

export interface AttachmentUploadState {
  status: AttachmentUploadStatus;
  progress: number;
}

interface UploadEntry extends AttachmentUploadState {
  promise: Promise<UploadResult>;
  controller: AbortController;
}

const entries = new Map<string, UploadEntry>();
const listeners = new Map<string, Set<() => void>>();

function notify(id: string): void {
  listeners.get(id)?.forEach((listener) => listener());
}

export function subscribeAttachmentUpload(id: string, listener: () => void): () => void {
  let set = listeners.get(id);
  if (!set) {
    set = new Set();
    listeners.set(id, set);
  }
  set.add(listener);
  return () => {
    set.delete(listener);
    if (set.size === 0) listeners.delete(id);
  };
}

export function getAttachmentUpload(id: string): AttachmentUploadState | undefined {
  return entries.get(id);
}

export function startAttachmentUpload(
  id: string,
  client: MatrixClient,
  roomId: string,
  file: File
): Promise<UploadResult> {
  const existing = entries.get(id);
  if (existing && existing.status !== 'error') return existing.promise;

  const controller = new AbortController();
  const entry: UploadEntry = {
    status: 'uploading',
    progress: 0,
    controller,
    promise: Promise.resolve() as unknown as Promise<UploadResult>,
  };
  entry.promise = uploadEncryptedFile(
    client,
    roomId,
    file,
    () => {},
    (progress) => {
      const current = entries.get(id);
      if (!current || current.controller !== controller) return;
      entries.set(id, { ...current, progress });
      notify(id);
    },
    controller
  ).then(
    (result) => {
      const current = entries.get(id);
      if (current?.controller === controller) {
        entries.set(id, { ...current, status: 'done', progress: 1 });
        notify(id);
      }
      return result;
    },
    (err: unknown) => {
      const current = entries.get(id);
      if (current?.controller === controller && !controller.signal.aborted) {
        entries.set(id, { ...current, status: 'error' });
        notify(id);
      }
      throw err;
    }
  );
  entry.promise.catch(() => {});
  entries.set(id, entry);
  notify(id);
  return entry.promise;
}

export function cancelAttachmentUpload(id: string): void {
  entries.get(id)?.controller.abort();
  entries.delete(id);
  notify(id);
}

export function forgetAttachmentUpload(id: string): void {
  entries.delete(id);
}

export function useAttachmentUpload(id: string): AttachmentUploadState | undefined {
  return useSyncExternalStore(
    (listener) => subscribeAttachmentUpload(id, listener),
    () => entries.get(id)
  );
}
