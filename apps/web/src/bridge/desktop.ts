/** What differs in the desktop app (Tauri): sign-in in the system browser, files, links */
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { openUrl } from '@tauri-apps/plugin-opener';
import i18n from '@/i18n';
import { desktopApi, onDesktopEvent } from './desktopApi';

export const isDesktop = import.meta.env.DESKTOP;
const isMacDesktop = isDesktop && /Mac/.test(navigator.userAgent);
/** On Windows the window has no frame and the app draws minimize/maximize/close */
export const drawsWindowControls = isDesktop && /Windows/.test(navigator.userAgent);

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
    await openUrl(pending.url());
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

function isExternal(url: string): boolean {
  try {
    const { protocol } = new URL(url, location.href);
    return protocol === 'http:' || protocol === 'https:' || protocol === 'mailto:';
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
      if (link.origin === location.origin || !isExternal(link.href)) return;
      event.preventDefault();
      void openUrl(link.href);
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
  if (drawsWindowControls) root.classList.add('desktop-other');
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
    if (href && isExternal(href) && new URL(href, location.href).origin !== location.origin) {
      void openUrl(href);
      return null;
    }
    return open(url, target, features);
  };
  interceptExternalLinks(document);
}
