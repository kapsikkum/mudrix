import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { SpinnerGapIcon, ArrowSquareOutIcon, LockIcon } from '@phosphor-icons/react';
import type { UiaAuth, UiaOutcome } from '@wizardchat/core';
import { getMatrixClientOrNull } from '@/client/initMatrix';
import { waitForSsoFallback } from '@/app/features/sso/sso';
import * as css from './Sessions.css';
import * as layoutCss from '../Settings.css';

/** Each flow is a list of auth stages */
export type UiaFlows = string[][];

type AuthRequired = Extract<UiaOutcome, { status: 'authRequired' }>;

export interface UiaChallenge {
  flows: UiaFlows;
  session: string | null;
  /** The server's single sign-on page for this session, when offered */
  ssoUrl: string | null;
  deviceId: string;
  displayName: string;
}

export function uiaChallenge(outcome: AuthRequired, deviceId = '', displayName = ''): UiaChallenge {
  return {
    flows: outcome.flows,
    session: outcome.session,
    ssoUrl: outcome.ssoUrl,
    deviceId,
    displayName,
  };
}

/** Opens the server's sign-on page; resolves to the auth to retry with once it's done */
export async function confirmWithSso(challenge: UiaChallenge): Promise<UiaAuth> {
  const client = getMatrixClientOrNull();
  if (!challenge.ssoUrl || !challenge.session || !client) throw new Error('sso_unavailable');
  await waitForSsoFallback(challenge.ssoUrl, client.session().homeserverUrl);
  return { type: 'fallback', session: challenge.session };
}

export function isSsoCancelled(err: unknown): boolean {
  return err instanceof Error && err.message === 'sso_popup_closed';
}

export function passwordAuth(challenge: UiaChallenge, password: string): UiaAuth {
  return { type: 'password', password, session: challenge.session };
}

export function offersPassword(flows: UiaFlows | undefined): boolean {
  return (flows ?? []).some((f) => f.includes('m.login.password'));
}

export function offersSso(flows: UiaFlows | undefined): boolean {
  return (flows ?? []).some((f) => f.includes('m.login.sso') || f.includes('org.matrix.login.sso'));
}

interface UiaPanelProps {
  challenge: UiaChallenge;
  onSubmitPassword: (password: string) => Promise<void>;
  onSso?: () => void;
  onCancel: () => void;
  submitting: boolean;
  description?: string;
  submitLabel?: string;
}

export function UiaPanel({
  challenge,
  onSubmitPassword,
  onSso,
  onCancel,
  submitting,
  description,
  submitLabel,
}: UiaPanelProps) {
  const { t } = useTranslation();
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const flows = challenge.flows;
  const canPassword = offersPassword(flows);
  const canSso = !!onSso && offersSso(flows);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = async (e: React.SyntheticEvent) => {
    e.preventDefault();
    setError('');
    try {
      await onSubmitPassword(password);
    } catch {
      setError(t('settings.sessions.incorrectPassword'));
      setPassword('');
      inputRef.current?.focus();
    }
  };

  return (
    <div className={css.uiaPanel}>
      <div className={css.uiaPanelHeader}>
        <LockIcon size={18} />
        <span>{t('settings.sessions.authRequired')}</span>
      </div>
      <p className={css.uiaPanelDesc}>
        {description ?? t('settings.sessions.authRequiredDesc', { name: challenge.displayName })}
      </p>

      {canPassword && (
        <form onSubmit={handleSubmit} className={css.uiaForm}>
          <input
            ref={inputRef}
            type="password"
            className={layoutCss.inputFull}
            placeholder={t('settings.sessions.passwordPlaceholder')}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={submitting}
            autoComplete="current-password"
          />
          {error && <p className={css.uiaError}>{error}</p>}
          <div className={css.uiaActions}>
            <button
              type="submit"
              className={layoutCss.actionBtn}
              disabled={submitting || !password}
            >
              {submitting ? (
                <SpinnerGapIcon size={14} className="icon-spin" />
              ) : (
                (submitLabel ?? t('settings.sessions.confirmRemove'))
              )}
            </button>
            <button
              type="button"
              className={layoutCss.actionBtnSecondary}
              onClick={onCancel}
              disabled={submitting}
            >
              {t('common.cancel')}
            </button>
          </div>
        </form>
      )}

      {canSso && (
        <div className={css.uiaSso}>
          {canPassword && <p className={css.uiaSsoDivider}>{t('common.or')}</p>}
          <button
            type="button"
            className={layoutCss.actionBtnSecondary}
            onClick={onSso}
            disabled={submitting}
          >
            {submitting ? (
              <SpinnerGapIcon size={14} className="icon-spin" />
            ) : (
              <ArrowSquareOutIcon size={14} />
            )}
            {t('common.continueWithSso')}
          </button>
        </div>
      )}

      {!canPassword && !canSso && (
        <div className={css.uiaUnsupported}>
          <p>{t('settings.sessions.authMethodUnsupported')}</p>
          <button type="button" className={layoutCss.actionBtnSecondary} onClick={onCancel}>
            {t('common.cancel')}
          </button>
        </div>
      )}
    </div>
  );
}
