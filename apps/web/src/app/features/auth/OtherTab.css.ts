import { style } from '@vanilla-extract/css';
import { vars } from '@/theme/vars.css';
import { fontSize } from '@/theme/typeScale';

export const overlay = style({
  position: 'fixed',
  inset: 0,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '16px',
  backgroundColor: vars.color.bgPrimary,
  padding: '2rem',
  zIndex: 100,
});

export const box = style({
  maxWidth: '480px',
  textAlign: 'center',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: '12px',
});

export const heading = style({
  fontSize: fontSize.md,
  fontWeight: 600,
  color: vars.color.textPrimary,
  margin: 0,
});

export const body = style({
  fontSize: fontSize.sm,
  lineHeight: 1.5,
  color: vars.color.textSecondary,
  margin: 0,
});

export const actions = style({
  display: 'flex',
  gap: '8px',
  marginTop: '4px',
  flexWrap: 'wrap',
  justifyContent: 'center',
});
