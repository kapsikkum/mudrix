import { useAtomValue } from 'jotai';
import { pushToTalkHeldAtom, pushToTalkModeAtom } from '@/app/store/atoms/call';
import { deafenedAtom, micMutedAtom } from '@/app/store/atoms/settings';
import * as css from './PushToTalkDot.css';

export function PushToTalkDot({ children }: { children: React.ReactNode }) {
  const mode = useAtomValue(pushToTalkModeAtom);
  const held = useAtomValue(pushToTalkHeldAtom);
  const muted = useAtomValue(micMutedAtom);
  const deafened = useAtomValue(deafenedAtom);
  if (!mode) return <>{children}</>;
  const talking = held && !muted && !deafened;
  return (
    <span className={css.wrap}>
      {children}
      <span className={talking ? css.dotHeld : css.dotIdle} aria-hidden />
    </span>
  );
}
