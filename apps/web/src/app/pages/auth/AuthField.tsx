import { forwardRef, useId, type ReactNode } from 'react';
import { Input } from '@/app/components/Input';
import * as css from './WelcomePage.css';

type InputProps = React.ComponentProps<typeof Input>;

interface AuthFieldProps extends Omit<InputProps, 'label' | 'helperText' | 'error'> {
  label: string;
  /** Muted text in the line under the field. */
  hint?: ReactNode;
  /** Red text in the line under the field; wins over the hint and marks the input invalid. */
  error?: string;
  /** Something at the right end of the label row (a link). */
  aside?: ReactNode;
  showRequired?: boolean;
}

/**
 * A labelled input with a message line under it that is always there, so hints and errors come
 * and go without moving anything. The line is the input's description for screen readers.
 */
export const AuthField = forwardRef<HTMLInputElement, AuthFieldProps>(function AuthField(
  { label, hint, error, aside, showRequired, id, ...rest },
  ref
) {
  const autoId = useId();
  const inputId = id ?? `f${autoId}`;
  const messageId = `${inputId}-msg`;
  return (
    <div className={css.field}>
      <div className={css.labelRow}>
        <label className={css.label} htmlFor={inputId}>
          {label}
          {showRequired && (
            <span className={css.required} aria-hidden>
              *
            </span>
          )}
        </label>
        {aside}
      </div>
      <Input
        ref={ref}
        id={inputId}
        aria-describedby={messageId}
        aria-invalid={error ? true : undefined}
        autoCorrect="off"
        autoCapitalize="none"
        spellCheck={false}
        {...rest}
      />
      {/* Not a live region: the hint changes with every keystroke. Errors are announced by the
          form (and focus moves to the field, which reads this description). */}
      <div id={messageId} className={error ? css.messageError : css.message}>
        {error || hint}
      </div>
    </div>
  );
});
