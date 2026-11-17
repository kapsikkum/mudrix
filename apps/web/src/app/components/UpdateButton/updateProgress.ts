/** What the shell says about an update download, as the buttons draw it. */
export interface UpdateDownloadProgress {
  downloaded: number;
  total: number | null;
  percent: number | null;
}

/** The share of the thin bar under the update button to fill, 0 when the size is unknown. */
export function barPercent(percent: number | null | undefined): number {
  if (percent == null || !Number.isFinite(percent)) return 0;
  return Math.min(100, Math.max(0, Math.round(percent)));
}

/** Which label the About button shows: a download in progress wins over the spinner. */
export function aboutUpdateLabel(state: {
  checking: boolean;
  upToDate: boolean;
  percent: number | null;
  ready: boolean;
}): 'upToDate' | 'downloading' | 'checking' | 'checkNow' {
  if (state.upToDate) return 'upToDate';
  if (state.percent !== null && !state.ready) return 'downloading';
  return state.checking ? 'checking' : 'checkNow';
}
