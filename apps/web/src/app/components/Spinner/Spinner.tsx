import * as css from './Spinner.css';

export type SpinnerSize = 'sm' | 'md' | 'lg' | 'xl';

interface SpinnerProps {
  size?: SpinnerSize;
  centered?: boolean;
  className?: string;
}

export function Spinner({ size = 'md', centered = false, className }: SpinnerProps) {
  const spinner = <div className={[css.sizes[size], className].filter(Boolean).join(' ')} />;
  if (centered) return <div className={css.wrap}>{spinner}</div>;
  return spinner;
}

export function SpinnerOverlay({ size = 'lg' }: { size?: SpinnerSize }) {
  return (
    <div className={css.overlay}>
      <Spinner size={size} />
    </div>
  );
}
