import { style } from '@vanilla-extract/css';
import { vars } from '@/theme/vars.css';

export const field = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '8px',
});

export const list = style({
  display: 'flex',
  flexDirection: 'column',
  borderRadius: vars.radius.md,
  border: `1px solid ${vars.color.border}`,
  overflow: 'hidden',
});

export const row = style({
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
  padding: '8px 8px 8px 12px',
  borderBottom: `1px solid ${vars.color.border}`,
  selectors: {
    '&:last-child': { borderBottom: 'none' },
  },
});

export const info = style({
  flex: 1,
  minWidth: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: '1px',
});

export const name = style({
  fontSize: '0.88rem',
  fontWeight: 500,
  color: vars.color.textPrimary,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});

export const userId = style({
  fontSize: '0.76rem',
  color: vars.color.textMuted,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});
