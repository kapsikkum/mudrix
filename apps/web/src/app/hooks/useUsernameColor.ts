import { useCallback } from 'react';
import { useAtomValue } from 'jotai';
import { colorUsernamesAtom } from '@/app/store/atoms/settings';
import { vars } from '@/theme/vars.css';

const COLORS = [
  vars.username.c1,
  vars.username.c2,
  vars.username.c3,
  vars.username.c4,
  vars.username.c5,
  vars.username.c6,
  vars.username.c7,
  vars.username.c8,
];

function hashCode(text: string): number {
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash << 5) - hash + text.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

export function usernameColor(userId: string): string {
  return COLORS[hashCode(userId) % COLORS.length];
}

export function useUsernameColor(): (userId: string | null | undefined) => string | undefined {
  const enabled = useAtomValue(colorUsernamesAtom);
  return useCallback(
    (userId) => (enabled && userId ? usernameColor(userId) : undefined),
    [enabled]
  );
}
