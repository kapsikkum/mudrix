import { globalStyle, style } from '@vanilla-extract/css';
import { vars } from '@/theme/vars.css';

export const toolbar = style({ display: 'flex', gap: '8px', margin: '12px 0' });

export const category = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '6px',
  marginTop: '16px',
});

export const categoryName = style({
  fontSize: '0.75rem',
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  color: vars.color.textSecondary,
  margin: '0 0 2px',
});

export const row = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '8px',
  padding: '8px 10px',
  borderRadius: vars.radius.md,
  background: vars.color.bgTertiary,
  color: vars.color.textPrimary,
});

export const head = style({
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  minHeight: '32px',
});

export const rowName = style({
  flex: 1,
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});

// The voice toggle and the category picker share a line in two equal columns, styled alike, so
// every room's boxes line up whatever the row holds.
export const actions = style({
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  gap: '8px',
  alignItems: 'stretch',
});

export const actionsSingle = style({ gridTemplateColumns: '1fr' });

globalStyle(`${actions} > *`, { width: '100%', minWidth: 0, justifyContent: 'center' });
globalStyle(`${actions} > button`, {
  padding: '8px 12px',
  fontSize: '0.9rem',
  fontWeight: 400,
  backgroundColor: vars.color.bgInput,
  border: `1px solid ${vars.color.border}`,
  borderRadius: vars.radius.sm,
});
