import { useEffect } from 'react';
import { atom, useAtom, useAtomValue, useSetAtom } from 'jotai';
import { callPopoutOpenAtom, callSessionAtom } from '@/app/store/atoms/call';
import { PortalContainerContext } from '@/app/components/PortalContainer';
import { interceptExternalLinks } from '@/bridge/desktop';
import { isTauriDesktop } from '@/util/desktop';
import { CallViewOverride } from './useCallView';

/**
 * Desktop "pop out": the call's interface in a window of its own, so the main window is free for
 * the rest of the app. The call itself (the engine, the core, media) stays in the main window; the
 * interface is rendered into the other window's document by a portal (see CallLayer), so it is the
 * same React tree and everything it uses keeps working.
 *
 * The window is made by the desktop shell when this page calls window.open (the browser's own
 * Document Picture-in-Picture has no window to use in WebView2). The shell shows
 * `public/desktop/call-window.html`, and tells the app when the window is gone.
 */

/** The element in the window the call's interface goes into, once it is ready. */
export const callPopoutRootAtom = atom<HTMLElement | null>(null);

const WINDOW_PAGE = '/desktop/call-window.html';
const WINDOW_NAME = 'mudrix-call';
const WINDOW_FEATURES = 'popup,width=960,height=640';
const ROOT_ID = 'mudrix-call-root';
/** How often the window is checked: still there, still our page, styles and theme up to date. */
const CHECK_INTERVAL_MS = 250;

/** The window the shell made for us. It is only ever set while `callPopoutOpenAtom` is true. */
let popoutWindow: Window | null = null;

export function canOpenCallPopoutWindow(): boolean {
  return isTauriDesktop();
}

function hideCallPopout(): void {
  window.desktopAPI?.hideCallPopout?.();
}

function onCallPopoutClosed(cb: () => void): () => void {
  return window.desktopAPI?.onCallPopoutClosed?.(cb) ?? (() => {});
}

/** Opens the call window, or closes it when it is open. Call it from a click (a user gesture). */
export function useToggleCallPopout(): () => void {
  const [open, setOpen] = useAtom(callPopoutOpenAtom);
  return () => {
    if (open) {
      setOpen(false);
      return;
    }
    const win = window.open(WINDOW_PAGE, WINDOW_NAME, WINDOW_FEATURES);
    if (!win) {
      // A window left behind by a reload of the app has lost its link to us; the next try works.
      console.warn('[calls] could not open the call window');
      hideCallPopout();
      return;
    }
    popoutWindow = win;
    setOpen(true);
  };
}

function buildRoot(doc: Document, baseUri: string): HTMLElement {
  const base = doc.createElement('base');
  base.href = baseUri;
  doc.head.prepend(base);
  doc.title = document.title;
  const root = doc.createElement('div');
  root.id = ROOT_ID;
  root.style.cssText = 'position:fixed;inset:0;overflow:hidden;background:#11111e;';
  doc.body.replaceChildren(root);
  // Links in this document are not the app's, so they need the system-browser handling too
  interceptExternalLinks(doc);
  return root;
}

function allSheets(): CSSStyleSheet[] {
  return [...Array.from(document.styleSheets), ...document.adoptedStyleSheets];
}

/** Changes when styles are added (lazy chunks, dev-server injection), which is when to copy again. */
function sheetsSignature(): string {
  return allSheets()
    .map((sheet) => {
      try {
        return sheet.cssRules.length;
      } catch {
        return 0;
      }
    })
    .join(',');
}

/** Copies the app's styles by their rules, which also catches the ones added through the CSSOM. */
function syncStyles(doc: Document): void {
  doc
    .querySelectorAll('style[data-popout-style], link[data-popout-style]')
    .forEach((node) => node.remove());
  allSheets().forEach((sheet) => {
    const style = doc.createElement('style');
    style.setAttribute('data-popout-style', '');
    try {
      style.textContent = Array.from(sheet.cssRules)
        .map((rule) => rule.cssText)
        .join('\n');
    } catch {
      // A sheet from another origin cannot be read; link it instead.
      if (!sheet.href) return;
      const link = doc.createElement('link');
      link.rel = 'stylesheet';
      link.href = sheet.href;
      link.setAttribute('data-popout-style', '');
      doc.head.appendChild(link);
      return;
    }
    doc.head.appendChild(style);
  });
}

/** Theme, language and the custom properties on the root element follow the app. */
function syncAttributes(doc: Document): void {
  const from = document.documentElement;
  const to = doc.documentElement;
  Array.from(from.attributes).forEach((attr) => {
    if (to.getAttribute(attr.name) !== attr.value) to.setAttribute(attr.name, attr.value);
  });
  if (doc.body.className !== document.body.className) doc.body.className = document.body.className;
}

/** Keeps the window going while the call is in it. Mounted once, with the call layer. */
export function CallPopoutWindow() {
  const [open, setOpen] = useAtom(callPopoutOpenAtom);
  const setRoot = useSetAtom(callPopoutRootAtom);
  const session = useAtomValue(callSessionAtom);

  // The user closed the window; the call carries on in the app.
  useEffect(() => {
    if (!open) return undefined;
    return onCallPopoutClosed(() => setOpen(false));
  }, [open, setOpen]);

  // The call ended.
  useEffect(() => {
    if (open && !session) setOpen(false);
  }, [open, session, setOpen]);

  // However it came about, nothing is open any more: close what is left of the window.
  useEffect(() => {
    if (open) return;
    if (popoutWindow) {
      try {
        popoutWindow.close();
      } catch {
        // already gone
      }
      popoutWindow = null;
      hideCallPopout();
    }
  }, [open]);

  useEffect(() => {
    const win = popoutWindow;
    if (!open || !win) return undefined;
    let root: HTMLElement | null = null;
    let signature = '';
    const check = () => {
      if (win.closed) {
        setOpen(false);
        return;
      }
      try {
        const doc = win.document;
        if (!doc.body) return;
        // The window shows an empty page at first and then moves on to ours, which wipes what was
        // put in the first one: whenever the root is missing, make it again.
        if (!root || !root.isConnected || root.ownerDocument !== doc) {
          root = buildRoot(doc, document.baseURI);
          signature = '';
          setRoot(root);
        }
        const current = sheetsSignature();
        if (current !== signature) {
          syncStyles(doc);
          signature = current;
        }
        syncAttributes(doc);
      } catch {
        // Navigating; try again on the next check.
      }
    };
    check();
    const timer = window.setInterval(check, CHECK_INTERVAL_MS);
    return () => {
      window.clearInterval(timer);
      setRoot(null);
    };
  }, [open, setOpen, setRoot]);

  return null;
}

/** What the call's interface is wrapped in when it is rendered into the window. */
export function CallWindowProvider({
  root,
  children,
}: {
  root: HTMLElement;
  children: React.ReactNode;
}) {
  return (
    <PortalContainerContext.Provider value={root.ownerDocument.body}>
      <CallViewOverride.Provider value="fullscreen">{children}</CallViewOverride.Provider>
    </PortalContainerContext.Provider>
  );
}
