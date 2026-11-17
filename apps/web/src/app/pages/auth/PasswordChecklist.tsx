import { useTranslation } from 'react-i18next';
import { CheckIcon, CircleIcon, XIcon } from '@phosphor-icons/react';
import { checkPassword, type PasswordValidity } from '@/util/password';
import * as css from './WelcomePage.css';

const RULES: (keyof PasswordValidity)[] = ['length', 'uppercase', 'lowercase', 'number', 'special'];

/**
 * What a good password has. Neutral until something is typed (a wall of red crosses on an empty
 * form reads as "you did it wrong"), then each rule ticks green as it is met.
 */
export function PasswordChecklist({ password, id }: { password: string; id?: string }) {
  const { t } = useTranslation();
  const validity = checkPassword(password);
  return (
    <ul id={id} className={css.passwordReqs} aria-label={t('welcome.passwordRules.title')}>
      {RULES.map((key) => {
        const met = validity[key];
        return (
          <li
            key={key}
            className={[css.reqItem, met ? css.reqMet : undefined].filter(Boolean).join(' ')}
          >
            <span className={css.reqIcon} aria-hidden>
              {met ? (
                <CheckIcon size={12} weight="bold" />
              ) : password ? (
                <XIcon size={12} weight="bold" />
              ) : (
                <CircleIcon size={6} weight="fill" />
              )}
            </span>
            <span>
              {t(`welcome.passwordRules.${key}`)}
              <span className={css.srOnly}>
                {met ? ` (${t('welcome.passwordRules.met')})` : ''}
              </span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}
