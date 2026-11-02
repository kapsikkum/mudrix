import { forwardRef, useId, useState } from 'react';
import { EyeIcon, EyeSlashIcon } from '@phosphor-icons/react';
import { useTranslation } from 'react-i18next';
import { IconButton } from '@/app/components/Button';
import { Field } from '@/app/components/Field';
import * as css from './Input.css';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  helperText?: string;
  error?: string;
  showPasswordToggle?: boolean;
  leadingIcon?: React.ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  {
    label: labelText,
    helperText,
    error,
    className,
    id,
    type,
    showPasswordToggle,
    leadingIcon,
    ...rest
  },
  ref
) {
  const { t } = useTranslation();
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const isPassword = type === 'password' && showPasswordToggle;
  const [visible, setVisible] = useState(false);
  const resolvedType = isPassword ? (visible ? 'text' : 'password') : type;
  return (
    <Field
      label={labelText}
      hint={helperText}
      error={error}
      htmlFor={inputId}
      className={isPassword ? css.wrapWithToggle : undefined}
    >
      <div className={css.inputWrap}>
        {leadingIcon && <span className={css.leadingIcon}>{leadingIcon}</span>}
        <input
          ref={ref}
          id={inputId}
          type={resolvedType}
          className={[
            css.input,
            leadingIcon ? css.inputWithLeadingIcon : undefined,
            isPassword ? css.inputWithToggle : undefined,
            className,
          ]
            .filter(Boolean)
            .join(' ')}
          {...rest}
        />
        {isPassword && (
          <IconButton
            type="button"
            size="sm"
            className={css.passwordToggle}
            onClick={() => setVisible((v) => !v)}
            aria-label={visible ? t('common.hide') : t('common.show')}
            tabIndex={-1}
          >
            {visible ? <EyeIcon size={16} /> : <EyeSlashIcon size={16} />}
          </IconButton>
        )}
      </div>
    </Field>
  );
});

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  helperText?: string;
  error?: string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { label: labelText, helperText, error, className, id, ...rest },
  ref
) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  return (
    <Field label={labelText} hint={helperText} error={error} htmlFor={inputId}>
      <textarea
        ref={ref}
        id={inputId}
        className={[css.textarea, className].filter(Boolean).join(' ')}
        {...rest}
      />
    </Field>
  );
});
