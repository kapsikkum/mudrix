import type { InputHTMLAttributes } from 'react';
import * as css from './RangeInput.css';

/**
 * - `native`: the browser's own range control in the accent colour.
 * - `track`: a drawn track and thumb (the stepped `Slider`).
 * - `fill`: a drawn track filled up to the `--volume` custom property (the call volume sliders).
 */
export type RangeVariant = 'native' | 'track' | 'fill';

const VARIANT_CLASS: Record<RangeVariant, string> = {
  native: css.native,
  track: css.track,
  fill: css.fill,
};

interface RangeInputProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'type' | 'value' | 'onChange' | 'min' | 'max' | 'step'
> {
  value: number;
  onChange: (value: number) => void;
  max: number;
  min?: number;
  step?: number;
  variant?: RangeVariant;
}

/** A range input that reports its value as a number; other props go to the `<input>`. */
export function RangeInput({
  value,
  onChange,
  max,
  min = 0,
  step,
  variant = 'native',
  className,
  ...rest
}: RangeInputProps) {
  return (
    <input
      {...rest}
      type="range"
      className={[VARIANT_CLASS[variant], className].filter(Boolean).join(' ')}
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
    />
  );
}
