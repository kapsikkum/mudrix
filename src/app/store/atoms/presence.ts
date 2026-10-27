import { atom } from 'jotai';
import { userIdAtom } from './auth';
import { atomWithAccountStorage } from './accountStorage';

export type PresenceState = 'online' | 'offline' | 'unavailable';

export type PresenceOverride = 'auto' | PresenceState;

export const presenceMapAtom = atom<Record<string, PresenceState>>({});

export const statusMsgMapAtom = atom<Record<string, string>>({});

export const presenceOverrideAtom = atomWithAccountStorage<PresenceOverride>(
  'wz_presence_override',
  'auto'
);

export type PresenceSupport = 'unknown' | 'supported' | 'unsupported';
export const presenceSupportAtom = atomWithAccountStorage<PresenceSupport>(
  'wz_presence_support',
  'unknown'
);
export const presenceVisibleAtom = atom((get) => get(presenceSupportAtom) === 'supported');

export const ownPresenceAtom = atom<PresenceState | undefined>((get) => {
  const uid = get(userIdAtom);
  return uid ? get(presenceMapAtom)[uid] : undefined;
});

export interface CustomStatus {
  text: string;
  expiresAt?: number | null;
}

export const ownCustomStatusAtom = atomWithAccountStorage<CustomStatus | null>(
  'wz_custom_status',
  null
);
