import { useCallback, useEffect } from 'react';
import { useAtom } from 'jotai';
import { ApiConfirmDialog } from './ApiConfirmDialog';
import { integrationApiRequestAtom } from './runtime';

interface Props {
  /** The composer's `integrationOwner`: only dialogs it asked for are rendered here. */
  owner: string;
  roomId: string;
  /** Inserts a link at the cursor in the composer. Never sends it. */
  onInsertLink: (link: string) => void;
}

/** Mounted once next to a composer: shows its api confirmation dialog. */
export function IntegrationDialogs({ owner, roomId, onInsertLink }: Props) {
  const [apiRequest, setApiRequest] = useAtom(integrationApiRequestAtom);

  const closeApi = useCallback(() => setApiRequest(null), [setApiRequest]);

  // A composer that goes away (room change) takes its open dialog with it.
  useEffect(
    () => () => {
      setApiRequest((r) => (r?.owner === owner ? null : r));
    },
    [owner, setApiRequest]
  );

  return apiRequest?.owner === owner && apiRequest.roomId === roomId ? (
    <ApiConfirmDialog request={apiRequest} onClose={closeApi} onInsertLink={onInsertLink} />
  ) : null;
}
