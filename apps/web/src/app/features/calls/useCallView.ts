import { createContext, useContext } from 'react';
import { useAtomValue } from 'jotai';
import { callEffectiveViewAtom } from '@/app/store/atoms/call';
import type { CallView } from '@/app/store/atoms/call';

/**
 * The call's interface in a window of its own always looks like a fullscreen call, whatever the
 * main window is showing (see callPopoutOpenAtom).
 */
export const CallViewOverride = createContext<CallView | null>(null);

/** How the call is shown to whatever asks from inside it. */
export function useCallView(): CallView {
  const override = useContext(CallViewOverride);
  const view = useAtomValue(callEffectiveViewAtom);
  return override ?? view;
}
