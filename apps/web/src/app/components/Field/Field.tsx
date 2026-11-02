import { createContext, useContext, useId } from 'react';
import * as css from './Field.css';

const FieldLabelIdContext = createContext<string | undefined>(undefined);

export function useFieldLabelId(): string | undefined {
  return useContext(FieldLabelIdContext);
}

interface FieldProps {
  label?: string;
  hint?: string;
  error?: string;
  htmlFor?: string;
  className?: string;
  children: React.ReactNode;
}

export function Field({ label: labelText, hint, error, htmlFor, className, children }: FieldProps) {
  const generatedLabelId = useId();
  const labelId = labelText ? generatedLabelId : undefined;

  return (
    <div className={[css.field, className].filter(Boolean).join(' ')}>
      <FieldLabelIdContext.Provider value={labelId}>
        {labelText && (
          <label id={labelId} className={css.label} htmlFor={htmlFor}>
            {labelText}
          </label>
        )}
        {children}
      </FieldLabelIdContext.Provider>
      {error ? (
        <span className={css.error}>{error}</span>
      ) : hint ? (
        <span className={css.hint}>{hint}</span>
      ) : null}
    </div>
  );
}
