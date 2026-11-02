import { useCallback, useEffect, useRef, useState } from 'react';

const CLEAR_DELAY_MS = 160;

export function useMessageHover() {
  const [hoveredEventId, setHoveredEventId] = useState<string | null>(null);
  const clearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelClear = useCallback(() => {
    if (clearTimerRef.current !== null) {
      clearTimeout(clearTimerRef.current);
      clearTimerRef.current = null;
    }
  }, []);

  const onHover = useCallback(
    (eventId: string | null) => {
      cancelClear();
      if (eventId === null) {
        clearTimerRef.current = setTimeout(() => {
          clearTimerRef.current = null;
          setHoveredEventId(null);
        }, CLEAR_DELAY_MS);
        return;
      }
      setHoveredEventId(eventId);
    },
    [cancelClear]
  );

  useEffect(() => cancelClear, [cancelClear]);

  return [hoveredEventId, onHover] as const;
}
