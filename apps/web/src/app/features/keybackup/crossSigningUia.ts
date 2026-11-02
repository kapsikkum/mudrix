import type { WizardClient as MatrixClient, UiaAuth, UiaOutcome } from '@wizardchat/core';
import { errorCode } from '@/core/client';
import { waitForSsoFallback } from '@/app/features/sso/sso';
import type { CrossSigningUiaState } from '@/app/store/atoms';

export type CrossSigningUiaResult =
  { type: 'password'; password: string } | { type: 'sso' } | { type: 'reset' } | null;

function uiaCancelled(): Error {
  return new Error('UIA cancelled');
}

/**
 * Resets the cryptographic identity, asking for the account password or single sign-on when
 * the server requires it, or approval on the account-management page of delegated-auth servers.
 */
export async function resetIdentityWithUia(
  client: MatrixClient,
  setCrossSigningUia: (state: CrossSigningUiaState) => void,
  t: (key: string) => string
): Promise<void> {
  let approvalClosed = false;
  const reset = async (auth: UiaAuth | null): Promise<UiaOutcome> => {
    try {
      return await client.resetIdentityWithAuth(auth, (resetUrl) => {
        setCrossSigningUia({
          open: true,
          offerSso: false,
          resetUrl,
          resolve: (result) => {
            if (result !== null) return;
            approvalClosed = true;
            void client.cancelIdentityReset();
          },
        });
      });
    } catch (err) {
      if (approvalClosed) throw uiaCancelled();
      throw err;
    }
  };

  let outcome = await reset(null);
  let modalError: string | undefined;
  while (outcome.status === 'authRequired') {
    const challenge = outcome;
    const result = await new Promise<CrossSigningUiaResult>((resolve) =>
      setCrossSigningUia({ open: true, offerSso: !!challenge.ssoUrl, error: modalError, resolve })
    );

    if (result === null) throw uiaCancelled();
    if (result.type === 'reset') continue;

    if (result.type === 'sso') {
      if (!challenge.ssoUrl || !challenge.session) continue;
      try {
        await waitForSsoFallback(challenge.ssoUrl, client.session().homeserverUrl);
      } catch (ssoErr: unknown) {
        if (ssoErr instanceof Error && ssoErr.message === 'sso_popup_closed') {
          modalError = t('settings.sessions.ssoCancelled');
          continue;
        }
        throw ssoErr;
      }
      outcome = await reset({ type: 'fallback', session: challenge.session });
      continue;
    }

    try {
      outcome = await reset({ type: 'password', password: result.password, session: null });
      modalError = undefined;
    } catch (retryErr: unknown) {
      if (errorCode(retryErr) !== 'invalidCredentials') throw retryErr;
      modalError = t('settings.sessions.incorrectPassword');
    }
  }
  setCrossSigningUia({ open: false, offerSso: false });
}
