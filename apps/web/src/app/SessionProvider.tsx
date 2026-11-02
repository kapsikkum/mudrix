import { type ReactNode, useState, useSyncExternalStore } from 'react';
import { Provider, createStore } from 'jotai';
import { getStoredUserId, subscribeStoredUserId } from '@/const/accountStorage';

interface Props {
  children: ReactNode;
}

function IsolatedStore({ children }: Props) {
  const [store] = useState(createStore);
  return <Provider store={store}>{children}</Provider>;
}

export function SessionProvider({ children }: Props) {
  const userId = useSyncExternalStore(subscribeStoredUserId, getStoredUserId, getStoredUserId);

  return <IsolatedStore key={userId ?? 'anonymous'}>{children}</IsolatedStore>;
}
