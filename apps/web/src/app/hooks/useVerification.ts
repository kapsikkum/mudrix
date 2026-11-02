import { useEffect } from 'react';
import { useSetAtom } from 'jotai';
import { useTranslation } from 'react-i18next';
import type { WizardClient as MatrixClient } from '@wizardchat/core';
import { verificationBannerAtom } from '@/app/store/atoms';

export function useVerification(client: MatrixClient | null) {
  const { t } = useTranslation();
  const setBanner = useSetAtom(verificationBannerAtom);

  useEffect(() => {
    if (!client) return;

    const subscription = client.watchVerificationRequests((request) => {
      let seen = false;
      const watcher = request.watch((status) => {
        if (seen) return;
        seen = true;
        queueMicrotask(() => watcher.cancel());
        if (status.state !== 'incoming') return;

        const otherUser = request.otherUserId();
        const isSelf = request.isSelfVerification();

        setBanner({
          visible: true,
          text: isSelf
            ? t('verification.newSignInDetected', { otherUser })
            : t('verification.verificationRequestFrom', { otherUser }),
          request,
        });
      });
    });

    return () => subscription.cancel();
  }, [client, setBanner, t]);
}
