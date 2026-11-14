import { vars } from '@/theme/vars.css';

interface BarProps {
  value: number;
  max: number;
  tone?: 'accent' | 'warning' | 'danger';
  label?: string;
}

/** Thin determinate bar. */
export function PackBar({ value, max, tone = 'accent', label }: BarProps) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  const color =
    tone === 'danger'
      ? vars.color.danger
      : tone === 'warning'
        ? vars.color.warning
        : vars.color.accent;
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={Math.min(value, max)}
      aria-label={label}
      style={{
        height: 6,
        borderRadius: 3,
        overflow: 'hidden',
        backgroundColor: vars.color.bgTertiary,
        border: `1px solid ${vars.color.border}`,
      }}
    >
      <div
        style={{
          width: `${pct}%`,
          height: '100%',
          backgroundColor: color,
          transition: 'width 120ms linear',
        }}
      />
    </div>
  );
}
