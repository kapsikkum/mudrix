import { useAtomValue } from 'jotai';
import { syncReadyAtom, syncStateAtom } from '@/app/data/atoms';

export function useSyncReady(): boolean {
  return useAtomValue(syncReadyAtom);
}

/** Connected and syncing (not offline or failing) */
export function useSyncHealthy(): boolean {
  const state = useAtomValue(syncStateAtom);
  return state === 'running' || state === 'idle';
}
