import * as css from './Toggle.css';

export type ToggleSize = 'sm' | 'md';

interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  size?: ToggleSize;
  disabled?: boolean;
  id?: string;
  ariaLabel?: string;
}

export function Toggle({
  checked,
  onChange,
  size = 'md',
  disabled = false,
  id,
  ariaLabel,
}: ToggleProps) {
  return (
    <label
      className={[
        css.trackSizes[size],
        checked ? css.trackChecked : '',
        disabled ? css.trackDisabled : '',
      ]
        .filter(Boolean)
        .join(' ')}
      htmlFor={id}
    >
      <input
        id={id}
        type="checkbox"
        className={css.nativeInput}
        checked={checked}
        onChange={(e) => !disabled && onChange(e.target.checked)}
        disabled={disabled}
        aria-label={ariaLabel}
      />
      <span
        className={[css.thumbSizes[size], checked ? css.thumbCheckedSizes[size] : '']
          .filter(Boolean)
          .join(' ')}
      />
    </label>
  );
}

interface ToggleRowProps {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  size?: ToggleSize;
  disabled?: boolean;
  id?: string;
}

export function ToggleRow({
  label,
  description,
  checked,
  onChange,
  size = 'md',
  disabled,
  id,
}: ToggleRowProps) {
  return (
    <div className={css.row}>
      <div className={css.rowInfo}>
        <span className={css.rowLabel}>{label}</span>
        {description && <span className={css.rowDescription}>{description}</span>}
      </div>
      <Toggle
        checked={checked}
        onChange={onChange}
        size={size}
        disabled={disabled}
        id={id}
        ariaLabel={label}
      />
    </div>
  );
}
