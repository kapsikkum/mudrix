import { atom } from 'jotai';
import type { NotifLevel } from '@/app/hooks/useNotifications';

export const roomNotifLevelAtom = atom<Record<string, NotifLevel>>({});
