import { createContext, useContext } from 'react';

/**
 * Where tooltips, popovers and dialogs go. Normally the page's body; the call's window of its own
 * (see CallPopoutWindow) is another document, and what is opened from inside it has to open there.
 */
export const PortalContainerContext = createContext<HTMLElement | null>(null);

export function usePortalContainer(): HTMLElement {
  return useContext(PortalContainerContext) ?? document.body;
}
