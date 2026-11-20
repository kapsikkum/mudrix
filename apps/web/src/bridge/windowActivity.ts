/**
 * Whether the app is the window being looked at, in the terms the browser uses for a tab.
 *
 * On the web a tab answers this itself: `document.visibilityState` says whether the tab is shown,
 * `document.hasFocus()` whether it has the keyboard. A Tauri window answers neither the way a tab
 * does: WebView2 has no tabs, so a window that is merely behind another app stays "visible", and
 * the page's own focus depends on wry forwarding the host window's focus into the webview (which
 * it does not do in every case, see tauri-apps/tauri#13466). Asking the page alone therefore makes
 * the app believe it is being looked at while the person is elsewhere: read receipts are never
 * sent and no notification is raised for a message in another room.
 *
 * So on desktop the shell is asked, and "the window is not in front" counts as hidden, the way a
 * browser tab is hidden when the person is on another tab. Web and the native apps keep the DOM
 * answer unchanged.
 */
import { getCurrentWindow } from '@tauri-apps/api/window';
import { isDesktop } from './desktop';

type Listener = () => void;

const listeners = new Set<Listener>();
/** The shell's answer; null until it has answered (and on the web, which never asks). */
let desktopFocused: boolean | null = null;
let started = false;

function notify(): void {
  for (const listener of listeners) listener();
}

function setDesktopFocused(focused: boolean): void {
  if (desktopFocused === focused) return;
  desktopFocused = focused;
  notify();
}

function refreshDesktopFocus(): void {
  const appWindow = getCurrentWindow();
  appWindow.isFocused().then(setDesktopFocused, () => {});
}

/** The webview's own focus event: ask the shell again rather than trusting a cached answer. */
function onWindowFocus(): void {
  if (isDesktop) refreshDesktopFocus();
  notify();
}

/** The window lost the keyboard: it is behind another app even if the page still says visible. */
function onWindowBlur(): void {
  if (isDesktop) setDesktopFocused(false);
  notify();
}

/** Starts listening once, the first time anything asks. */
function start(): void {
  if (started) return;
  started = true;
  // Web and the native apps: the document's own events are the answer.
  document.addEventListener('visibilitychange', () => {
    // Restoring a minimised desktop window does not always send a focus event of its own.
    if (isDesktop) refreshDesktopFocus();
    notify();
  });
  window.addEventListener('focus', onWindowFocus);
  window.addEventListener('blur', onWindowBlur);
  if (!isDesktop) return;
  // Desktop: the window's, including the focus it gets back from the tray or after Alt+Tab.
  const appWindow = getCurrentWindow();
  void appWindow.onFocusChanged(({ payload }) => setDesktopFocused(payload));
  void appWindow.onResized(refreshDesktopFocus);
  refreshDesktopFocus();
}

/**
 * Whether the app is on screen: a shown tab (or native app), or on desktop a window that is in
 * front. A desktop window behind another app reads as hidden, so the same rules that raise a
 * browser notification for a background tab also raise a desktop one.
 */
export function isAppVisible(): boolean {
  if (!isDesktop) return document.visibilityState === 'visible';
  start();
  // Nothing of the app is on screen while another window is in front of it.
  return isAppFocused();
}

/** Whether the app has the keyboard: the tab's document, or on desktop the window itself. */
export function isAppFocused(): boolean {
  if (!isDesktop) return document.hasFocus();
  start();
  // Before the shell has answered, the page's own answer is the best guess; the focus event
  // corrects it a moment later.
  return desktopFocused ?? document.hasFocus();
}

/** Calls `listener` when the answers above change; returns an unsubscribe. */
export function onAppActivityChange(listener: Listener): () => void {
  start();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
