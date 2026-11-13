import { useState, useEffect, useCallback, useRef } from 'react';
import type { SearchHit, WizardClient as MatrixClient } from '@wizardchat/core';
import { getErrorMessage } from '@/util/error';
import { mergeHits } from './mergeSearchHits';

const DEBOUNCE_MS = 400;

export type ServerSearchStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface ServerSearchState {
  status: ServerSearchStatus;
  hits: SearchHit[];
  /** The token for the page after these, or null at the last one */
  next: string | null;
  loadingMore: boolean;
  error: string | null;
}

const IDLE: ServerSearchState = {
  status: 'idle',
  hits: [],
  next: null,
  loadingMore: false,
  error: null,
};

/**
 * Server-side message search scoped to one room, one page at a time. Only meaningful for
 * unencrypted rooms: the server cannot index ciphertext. Pass `enabled=false` to stay idle.
 */
export function useRoomServerSearch(
  client: MatrixClient,
  roomId: string,
  query: string,
  enabled: boolean
): ServerSearchState & { loadMore: () => void } {
  const [state, setState] = useState<ServerSearchState>(IDLE);
  const nextRef = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const term = query.trim();

  useEffect(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    nextRef.current = null;
    if (!enabled || !term) {
      setState(IDLE);
      return undefined;
    }

    const controller = new AbortController();
    abortRef.current = controller;
    setState({ ...IDLE, status: 'loading' });

    const timer = setTimeout(() => {
      client
        .searchMessagesPage(term, roomId, null)
        .then((page) => {
          if (controller.signal.aborted) return;
          nextRef.current = page.next;
          setState({
            status: 'ready',
            hits: page.hits,
            next: page.next,
            loadingMore: false,
            error: null,
          });
        })
        .catch((err) => {
          if (controller.signal.aborted) return;
          setState({ ...IDLE, status: 'error', error: getErrorMessage(err) });
        });
    }, DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [client, roomId, term, enabled]);

  const loadMore = useCallback(() => {
    const from = nextRef.current;
    const controller = abortRef.current;
    if (!from || !controller || controller.signal.aborted) return;
    nextRef.current = null; // guard against double triggers
    setState((prev) => ({ ...prev, loadingMore: true }));
    client
      .searchMessagesPage(term, roomId, from)
      .then((page) => {
        if (controller.signal.aborted) return;
        nextRef.current = page.next;
        setState((prev) => ({
          ...prev,
          hits: mergeHits(prev.hits, page.hits),
          next: page.next,
          loadingMore: false,
        }));
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        nextRef.current = from; // allow retry
        setState((prev) => ({ ...prev, loadingMore: false, error: getErrorMessage(err) }));
      });
  }, [client, roomId, term]);

  return { ...state, loadMore };
}
