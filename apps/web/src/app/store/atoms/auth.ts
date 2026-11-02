import { atom } from 'jotai';
import type { MatrixCredentials } from '@/client/types';
import { loadCredentials } from '@/client/initMatrix';

export type { MatrixCredentials };

/** The active account's stored credentials */
export const credentialsAtom = atom<MatrixCredentials | null>(loadCredentials());

export const userIdAtom = atom<string | null>(null);

export const DEFAULT_MAX_UPLOAD_BYTES = 15 * 1024 * 1024;
export const serverUploadLimitAtom = atom<number>(DEFAULT_MAX_UPLOAD_BYTES);
