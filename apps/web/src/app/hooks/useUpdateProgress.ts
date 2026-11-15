import { useEffect, useState } from 'react';

export interface UpdateDownloadState {
  /** Whole percent of the download, or null while nothing is downloading (or its size is unknown). */
  percent: number | null;
  /** The download finished and a click installs it. */
  ready: boolean;
}

/**
 * How far the shell's update download has come. Both the toolbar button and About show it, so the
 * subscription lives here; the shell re-sends `update-downloaded` on mount when one is waiting.
 */
export function useUpdateProgress(): UpdateDownloadState {
  const [state, setState] = useState<UpdateDownloadState>({ percent: null, ready: false });

  useEffect(() => {
    const stopProgress = window.desktopAPI?.onUpdateProgress?.(({ percent }) =>
      setState((prev) => (prev.percent === percent ? prev : { ...prev, percent }))
    );
    const stopDownloaded = window.desktopAPI?.onUpdateDownloaded?.(() =>
      setState({ percent: null, ready: true })
    );
    return () => {
      stopProgress?.();
      stopDownloaded?.();
    };
  }, []);

  return state;
}
