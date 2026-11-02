import { createContext, useCallback, useContext, useMemo, useRef } from 'react';
import type { ReactNode, RefObject } from 'react';
import * as css from '@/app/features/calls/CallLayer.css';

interface CallContainerValue {
  containerRef: RefObject<HTMLDivElement | null>;
  getContainer: () => HTMLDivElement | null;
}

const CallContainerContext = createContext<CallContainerValue | null>(null);

export function CallContainerProvider({ children }: { children: ReactNode }) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  const getContainer = useCallback(() => containerRef.current, []);
  const value = useMemo(() => ({ containerRef, getContainer }), [getContainer]);

  return <CallContainerContext.Provider value={value}>{children}</CallContainerContext.Provider>;
}

export function CallContainer() {
  const { containerRef } = useCallContainer();
  return <div ref={containerRef} className={css.container} />;
}

export function useCallContainer(): CallContainerValue {
  const ctx = useContext(CallContainerContext);
  if (!ctx) {
    throw new Error('useCallContainer must be used within a CallContainerProvider');
  }
  return ctx;
}
