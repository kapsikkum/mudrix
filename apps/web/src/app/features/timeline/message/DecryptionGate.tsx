import type { ReactNode } from 'react';
import type { EventEntry } from './entry';

interface DecryptionGateProps {
  event: EventEntry;
  children: () => ReactNode;
}

export function DecryptionGate({ children }: DecryptionGateProps) {
  return <>{children()}</>;
}
