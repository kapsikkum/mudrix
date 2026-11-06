import { style } from '@vanilla-extract/css';
import { vars } from '@/theme/vars.css';

export const heading = style({
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  padding: '0 8px 8px',
  borderBottom: `1px solid ${vars.color.border}`,
  fontSize: '1.2rem',
  flexShrink: 0,
});

export const emoji = style({
  display: 'inline-flex',
  alignItems: 'center',
});

export const count = style({
  fontSize: '0.9rem',
  fontWeight: 600,
  color: vars.color.textMuted,
});

export const list = style({
  listStyle: 'none',
  margin: 0,
  padding: 0,
  display: 'flex',
  flexDirection: 'column',
  overflowY: 'auto',
  overscrollBehavior: 'contain',
});

export const row = style({
  display: 'flex',
  alignItems: 'center',
  gap: '12px',
  minHeight: '48px',
  padding: '4px 8px',
});

export const name = style({
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  color: vars.color.textPrimary,
  fontSize: '0.95rem',
});
