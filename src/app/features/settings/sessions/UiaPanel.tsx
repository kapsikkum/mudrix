import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { SpinnerGapIcon, ArrowSquareOutIcon, LockIcon } from '@phosphor-icons/react';
import { AuthType } from 'matrix-js-sdk/lib/interactive-auth';
import type { IAuthData, UIAFlow } from 'matrix-js-sdk/lib/interactive-auth';
import * as css from './Sessions.css';
import * as layoutCss from '../Settings.css';

export interface UiaChallenge {
  authData: IAuthData;
  deviceId: string;
  displayName: string;
}

export function offersPassword(flows: UIAFlow[] | undefined): boolean {
  return (flows ?? []).some((f) => f.stages.includes(AuthType.Password));
}

export function offersSso(flows: UIAFlow[] | undefined): boolean {
  return (flows ?? []).some(
    (f) => f.stages.includes(AuthType.Sso) || f.stages.includes(AuthType.SsoUnstable)
  );
}

interface UiaPanelProps {
  challenge: UiaChallenge;
  onSubmitPassword: (password: string) => Promise<void>;
  onSso: () => void;
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

  const flows = challenge.authData.flows;
  const canPassword = offersPassword(flows);
  const canSso = offersSso(flows);

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
            {t('settings.sessions.continueWithSso')}
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
