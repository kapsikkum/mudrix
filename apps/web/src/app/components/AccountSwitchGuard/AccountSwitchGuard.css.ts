import { style } from '@vanilla-extract/css';
import { vars } from '@/theme/vars.css';
import { fontSize } from '@/theme/typeScale';

export const overlay = style({
  position: 'fixed',
  inset: 0,
  zIndex: 20000,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '20px',
  padding: '2rem',
  backgroundColor: vars.color.bgPrimary,
});

export const box = style({
  maxWidth: '440px',
  textAlign: 'center',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: '16px',
});

export const heading = style({
  fontSize: fontSize.lg,
  fontWeight: 600,
  color: vars.color.textPrimary,
  margin: 0,
});

export const message = style({
  fontSize: fontSize.sm,
  color: vars.color.textMuted,
  lineHeight: 1.5,
  margin: 0,
});

export const account = style({
  color: vars.color.textPrimary,
  fontWeight: 600,
});
