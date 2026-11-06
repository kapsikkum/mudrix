/**
 * Streamer mode: whether private details (email, IDs, session IPs, recovery keys, notification
 * text) are hidden right now. The state is derived in React (see useStreamerMode) and mirrored
 * here so code outside React, such as the notification code, can ask too. The `data-streamer`
 * attribute on <html> is what the blur styles hang on.
 */

let active = false;

export function isStreamerModeActive(): boolean {
  return active;
}

export function setStreamerModeActive(next: boolean): void {
  active = next;
  if (typeof document === 'undefined') return;
  if (next) document.documentElement.dataset.streamer = 'on';
  else delete document.documentElement.dataset.streamer;
}
