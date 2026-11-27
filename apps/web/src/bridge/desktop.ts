/** What differs in the desktop app (Tauri): sign-in in the system browser, files, links */
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { openUrl } from '@tauri-apps/plugin-opener';
import i18n from '@/i18n';
import { desktopApi, onDesktopEvent } from './desktopApi';
import { startWindowControls } from './windowControls';

export const isDesktop = import.meta.env.DESKTOP;
const isMacDesktop = isDesktop && /Mac/.test(navigator.userAgent);

/**
 * Runs a browser sign-in (OAuth or SSO): the server's page opens in the system browser and
 * redirects back to a local port.
 */
export async function signInInBrowser<T>(
  start: (redirectUri: string) => Promise<{ url(): string }>,
  finish: (callbackUrl: string) => Promise<T>
): Promise<T> {
  const style = getComputedStyle(document.body);
  const background = [document.body, document.documentElement]
    .map((element) => getComputedStyle(element).backgroundColor)
    .find((color) => color !== 'transparent' && color !== 'rgba(0, 0, 0, 0)');
  const page = {
    signedInTitle: i18n.t('auth.browserReturn.signedInTitle'),
    signedInBody: i18n.t('auth.browserReturn.signedInBody'),
    failedTitle: i18n.t('auth.browserReturn.failedTitle'),
    failedBody: i18n.t('auth.browserReturn.failedBody'),
    background: background ?? '',
    foreground: style.color,
  };
  const port = await invoke<number>('loopback_listen', { page });
  try {
    const pending = await start(`http://127.0.0.1:${port}/callback`);
    const url = externalUrl(pending.url());
    if (!url) throw Object.assign(new Error('invalid sign-in URL'), { code: 'invalidUrl' });
    await openUrl(url);
    const callback = await invoke<string>('loopback_wait', { port });
    return await finish(callback);
  } catch (error) {
    void invoke('loopback_cancel', { port });
    throw error;
  }
}

export function deleteDesktopStore(location: string): Promise<void> {
  return invoke('core_delete_store', { location });
}

/** Schemes the app hands to the system; anything else stays in the app or is dropped. */
const EXTERNAL_PROTOCOLS = ['http:', 'https:', 'mailto:'];

/**
 * The absolute URL to open outside the app, or null when it is not a scheme the system may be
 * asked to open. Relative and protocol-relative links do not count: they would resolve against
 * a protocol they only appear to have.
 */
function externalUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    return EXTERNAL_PROTOCOLS.includes(parsed.protocol) ? parsed.href : null;
  } catch {
    return null;
  }
}

/** Whether a link stays inside the app: a relative path or this app's own origin. */
function isAppUrl(url: string): boolean {
  try {
    const parsed = new URL(url, location.href);
    return parsed.protocol === location.protocol && parsed.host === location.host;
  } catch {
    return false;
  }
}

/** Opens an `chat.mudrix.desktop://` link the app was opened with */
function openDeepLink() {
  void invoke<string | null>('take_deep_link').then((path) => {
    if (!path || path === location.pathname + location.search + location.hash) return;
    history.pushState(null, '', path);
    dispatchEvent(new PopStateEvent('popstate'));
  });
}

const interceptedDocuments = new WeakSet<Document>();

/**
 * Sends clicks on external links in `doc` to the system browser. The app's own document gets this at
 * start-up; the call's pop-out window has to be given it too, because it is a document of its own
 * (and a window the webview would otherwise refuse to open links from).
 */
export function interceptExternalLinks(doc: Document): void {
  if (interceptedDocuments.has(doc)) return;
  interceptedDocuments.add(doc);
  doc.addEventListener(
    'click',
    (event) => {
      const link = (event.target as Element | null)?.closest?.('a[href]');
      if (!(link instanceof HTMLAnchorElement) || link.hasAttribute('download')) return;
      if (isAppUrl(link.href)) return;
      // Only schemes the system may open are handed over; tel:, custom schemes and
      // protocol-relative targets are dropped instead of followed by the webview.
      event.preventDefault();
      const url = externalUrl(link.href);
      if (url) void openUrl(url);
    },
    true
  );
}

/** Installs the desktop API and window chrome; links that would open a new window go to the system browser */
export function installDesktopHooks(): void {
  if (!isDesktop) return;
  window.desktopAPI = desktopApi;
  onDesktopEvent('deep-link', openDeepLink);
  openDeepLink();
  // The window has no title bar of its own on macOS: the app's title bar sits under the
  // window buttons, which need room unless the window is fullscreen
  const root = document.documentElement;
  root.classList.add('desktop');
  if (isMacDesktop) root.classList.add('desktop-darwin');
  // Windows and Linux draw their own window buttons unless the setting keeps the system's frame
  startWindowControls();
  const appWindow = getCurrentWindow();
  const syncFullscreen = () =>
    appWindow
      .isFullscreen()
      .then((fullscreen) => root.classList.toggle('desktop-fullscreen', fullscreen));
  void syncFullscreen();
  void appWindow.onResized(syncFullscreen);

  const open = window.open.bind(window);
  window.open = (url, target, features) => {
    const href = url?.toString();
    if (href && href !== 'about:blank' && !isAppUrl(href)) {
      const external = externalUrl(href);
      if (!external) return null;
      void openUrl(external);
      return null;
    }
    return open(url, target, features);
  };
  interceptExternalLinks(document);
}
