import { useCallback, useEffect } from 'react';
import { useAtom } from 'jotai';
import type { WizardClient as MatrixClient } from '@wizardchat/core';
import { ApiConfirmDialog } from './ApiConfirmDialog';
import { IntegrationWidgetDialog } from './IntegrationWidgetDialog';
import { integrationApiRequestAtom, integrationWidgetAtom } from './runtime';

interface Props {
  /** The composer's `integrationOwner`: only dialogs it asked for are rendered here. */
  owner: string;
  client: MatrixClient;
  roomId: string;
  /** Inserts a link at the cursor in the composer. Never sends it. */
  onInsertLink: (link: string) => void;
}

/** Mounted once next to a composer: shows its api confirmation and widget dialogs. */
export function IntegrationDialogs({ owner, client, roomId, onInsertLink }: Props) {
  const [apiRequest, setApiRequest] = useAtom(integrationApiRequestAtom);
  const [widgetRequest, setWidgetRequest] = useAtom(integrationWidgetAtom);

  const closeApi = useCallback(() => setApiRequest(null), [setApiRequest]);
  const closeWidget = useCallback(() => setWidgetRequest(null), [setWidgetRequest]);

  // A composer that goes away (room change) takes its open dialogs with it.
  useEffect(
    () => () => {
      setApiRequest((r) => (r?.owner === owner ? null : r));
      setWidgetRequest((r) => (r?.owner === owner ? null : r));
    },
    [owner, setApiRequest, setWidgetRequest]
  );

  return (
    <>
      {apiRequest?.owner === owner && apiRequest.roomId === roomId && (
        <ApiConfirmDialog request={apiRequest} onClose={closeApi} onInsertLink={onInsertLink} />
      )}
      {widgetRequest?.owner === owner && (
        <IntegrationWidgetDialog
          // A different integration or room is a different widget, never a re-used frame.
          key={`${widgetRequest.roomId}/${widgetRequest.integrationId}`}
          client={client}
          roomId={roomId}
          request={widgetRequest}
          onClose={closeWidget}
        />
      )}
    </>
  );
}
