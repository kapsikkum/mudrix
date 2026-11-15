import { style } from '@vanilla-extract/css';
import { vars } from '@/theme/vars.css';
import { fontSize } from '@/theme/typeScale';

export const field = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '6px',
  width: '100%',
  minWidth: 0,
});

export const label = style({
  display: 'block',
  fontSize: fontSize.sm,
  fontWeight: 600,
  color: vars.color.textMuted,
  letterSpacing: '0.01em',
  cursor: 'text',
});

export const hint = style({
  fontSize: fontSize.xs,
  color: vars.color.textMuted,
});

export const error = style({
  fontSize: fontSize.xs,
  color: vars.color.danger,
});
