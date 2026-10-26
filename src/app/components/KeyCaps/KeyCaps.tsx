import * as css from './KeyCaps.css';

export function KeyCaps({
  keys,
  size = 'md',
}: {
  keys: React.ReactNode[] | string;
  size?: 'md' | 'sm';
}) {
  const list = typeof keys === 'string' ? keys.split(' + ') : keys;
  return (
    <span className={css.caps}>
      {list.map((k, i) => (
        // Keys can repeat (↑ ↑) and never reorder
        <kbd key={i} className={css.key[size]}>
          {k}
        </kbd>
      ))}
    </span>
  );
}

export function LabelWithKeys({ label, keys }: { label: string; keys?: React.ReactNode[] }) {
  if (!keys?.length) return <>{label}</>;
  return (
    <span className={css.labelWithKeys}>
      {label}
      <KeyCaps keys={keys} size="sm" />
    </span>
  );
}
