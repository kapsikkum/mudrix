import { useMemo } from 'react';
import { atom, useSetAtom } from 'jotai';

/**
 * What the composer asked to open. `owner` is the composer instance that asked (several composers
 * can be mounted, e.g. the room and a thread), so only that one renders the dialog.
 */
export interface ApiConfirmRequest {
  owner: string;
  roomId: string;
  integrationId: string;
  actionId: string;
  /** The composer draft as plain text (for a slash command: the arguments). */
  text: string;
  /** What was typed after the slash command; empty for a menu action. */
  args: string;
}

export interface IntegrationWidgetRequest {
  owner: string;
  roomId: string;
  integrationId: string;
}

export const integrationApiRequestAtom = atom<ApiConfirmRequest | null>(null);
/** At most one widget is open at a time. */
export const integrationWidgetAtom = atom<IntegrationWidgetRequest | null>(null);

export interface IntegrationLauncher {
  openApi: (integrationId: string, actionId: string, text: string, args?: string) => void;
  openWidget: (integrationId: string) => void;
}

/** Opens the api confirmation or the widget dialog of the composer identified by `owner`. */
export function useIntegrationLauncher(owner: string, roomId: string): IntegrationLauncher {
  const setApi = useSetAtom(integrationApiRequestAtom);
  const setWidget = useSetAtom(integrationWidgetAtom);
  return useMemo(
    () => ({
      openApi: (integrationId, actionId, text, args = '') =>
        setApi({ owner, roomId, integrationId, actionId, text, args }),
      openWidget: (integrationId) => setWidget({ owner, roomId, integrationId }),
    }),
    [owner, roomId, setApi, setWidget]
  );
}
