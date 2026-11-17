import { atom } from 'jotai';
import { atomWithDefault } from 'jotai/utils';
import type { MatrixCredentials } from '@/client/types';
import { loadCredentials } from '@/client/initMatrix';

export type { MatrixCredentials };

/** The active account's stored credentials, read per account store */
export const credentialsAtom = atomWithDefault<MatrixCredentials | null>(() => loadCredentials());

export const userIdAtom = atom<string | null>(null);

export const DEFAULT_MAX_UPLOAD_BYTES = 15 * 1024 * 1024;
export const serverUploadLimitAtom = atom<number>(DEFAULT_MAX_UPLOAD_BYTES);
