import { style } from '@vanilla-extract/css';
import { vars } from '@/theme/vars.css';

export const field = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '6px',
  width: '100%',
  minWidth: 0,
});

export const label = style({
  display: 'block',
  fontSize: '0.82rem',
  fontWeight: 600,
  color: vars.color.textMuted,
  letterSpacing: '0.05em',
  cursor: 'text',
});

export const hint = style({
  fontSize: '0.78rem',
  color: vars.color.textMuted,
});

export const error = style({
  fontSize: '0.78rem',
  color: vars.color.danger,
});
