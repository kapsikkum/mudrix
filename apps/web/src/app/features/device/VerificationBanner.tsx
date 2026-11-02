import { useEffect, useRef } from 'react';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import { useTranslation } from 'react-i18next';
import { ShieldIcon } from '@phosphor-icons/react';
import { verificationBannerAtom, emojiVerificationAtom } from '@/app/store/atoms';
import type { VerificationFlow } from '@wizardchat/core';
import { startSasVerification } from './startSasVerification';
import * as css from './VerificationBanner.css';

async function acceptRequest(
  request: VerificationFlow,
  setEmojiModal: ReturnType<typeof useSetAtom<typeof emojiVerificationAtom>>
): Promise<() => void> {
  try {
    await request.accept();
  } catch {
    // already accepted / already gone
  }

  return startSasVerification(request, setEmojiModal);
}

export function VerificationBanner() {
  const { t } = useTranslation();
  const [state, setBanner] = useAtom(verificationBannerAtom);
  const setEmojiModal = useSetAtom(emojiVerificationAtom);
  const emojiState = useAtomValue(emojiVerificationAtom);
  const teardownRef = useRef<(() => void) | null>(null);

  const teardown = () => {
    teardownRef.current?.();
    teardownRef.current = null;
  };

  useEffect(() => {
    if (!emojiState.open) {
      teardownRef.current?.();
      teardownRef.current = null;
    }
  }, [emojiState.open]);

  useEffect(
    () => () => {
      teardownRef.current?.();
      teardownRef.current = null;
    },
    []
  );

  const request = state.visible ? state.request : undefined;
  useEffect(() => {
    if (!request) return;
    const subscription = request.watch((status) => {
      if (status.state === 'incoming' || status.state === 'requested') return;
      setBanner((prev) => (prev.request === request ? { visible: false, text: '' } : prev));
    });
    return () => subscription.cancel();
  }, [request, setBanner]);

  if (!state.visible) return null;

  const dismiss = () => setBanner({ visible: false, text: '' });

  const handleDecline = async () => {
    if (state.request) {
      try {
        await state.request.cancel();
      } catch {
        // ignore
      }
    }
    dismiss();
  };

  const handleAccept = async () => {
    dismiss();
    if (state.request) {
      teardown();
      teardownRef.current = await acceptRequest(state.request, setEmojiModal);
    }
  };

  return (
    <div className={css.banner}>
      <div className={css.icon}>
        <ShieldIcon size={18} />
      </div>
      <div className={css.body}>
        <strong className={css.title}>{t('banner.incomingVerification')}</strong>
        <span className={css.text}>{state.text}</span>
        <div className={css.actions}>
          <button type="button" className={css.btnDecline} onClick={handleDecline}>
            {t('invite.decline')}
          </button>
          <button type="button" className={css.btnAccept} onClick={handleAccept}>
            {t('invite.accept')}
          </button>
        </div>
      </div>
    </div>
  );
}
