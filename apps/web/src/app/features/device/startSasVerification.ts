import type { VerificationFlow } from '@wizardchat/core';
import type { SetStateAction } from 'jotai';
import type { EmojiVerificationState } from '@/app/store/atoms';

type EmojiVerificationSetter = (update: SetStateAction<EmojiVerificationState>) => void;

export function startSasVerification(
  request: VerificationFlow,
  setEmojiModal: EmojiVerificationSetter
): () => void {
  let started = false;
  let accepted = false;
  let disposed = false;

  const cancel = () =>
    setEmojiModal((prev) => (prev.phase !== 'done' ? { ...prev, phase: 'cancelled' } : prev));

  setEmojiModal({
    open: true,
    request,
    phase: 'waiting',
    otherUserId: request.otherUserId(),
  });

  const subscription = request.watch((status) => {
    if (disposed) return;
    switch (status.state) {
      case 'ready':
        if (!started) {
          started = true;
          request.startSas().catch(cancel);
        }
        return;
      case 'sasIncoming':
        if (!accepted) {
          accepted = true;
          request.acceptSas().catch(cancel);
        }
        return;
      case 'emojis':
        setEmojiModal((prev) => ({ ...prev, phase: 'comparing', emojis: status.emojis }));
        return;
      case 'done':
        setEmojiModal((prev) => ({ ...prev, phase: 'done' }));
        return;
      case 'cancelled':
        cancel();
        return;
    }
  });

  return () => {
    disposed = true;
    subscription.cancel();
  };
}
