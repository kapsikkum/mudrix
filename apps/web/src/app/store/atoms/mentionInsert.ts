import { atom } from 'jotai';

export interface MentionInsert {
  text: string;
  displayName: string;
  userId: string;
}

export const mentionInsertAtom = atom<MentionInsert | null>(null);
