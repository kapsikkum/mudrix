import type { ReactNode } from 'react';
import * as css from './Sensitive.css';

/** Private details (email, IDs, IPs, keys) that streamer mode blurs. Unchanged otherwise. */
export function Sensitive({ children }: { children: ReactNode }) {
  return <span className={css.sensitive}>{children}</span>;
}
