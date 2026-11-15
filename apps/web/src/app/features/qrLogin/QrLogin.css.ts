import { style } from '@vanilla-extract/css';
import { vars } from '@/theme/vars.css';
import { fontSize } from '@/theme/typeScale';

export const body = style({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: '12px',
  textAlign: 'center',
});

export const qr = style({
  width: '240px',
  height: '240px',
  borderRadius: vars.radius.md,
  backgroundColor: '#ffffff',
});

export const text = style({
  margin: 0,
  fontSize: fontSize.sm,
  lineHeight: 1.5,
  color: vars.color.textMuted,
  maxWidth: '360px',
});

export const steps = style({
  margin: 0,
  paddingLeft: '20px',
  textAlign: 'left',
  fontSize: fontSize.sm,
  lineHeight: 1.6,
  color: vars.color.textPrimary,
});

export const checkCode = style({
  fontSize: fontSize.xxl,
  fontWeight: 600,
  letterSpacing: '0.3em',
  color: vars.color.textPrimary,
  fontVariantNumeric: 'tabular-nums',
});

export const codeInput = style({
  width: '120px',
  textAlign: 'center',
  fontSize: fontSize.xl,
  letterSpacing: '0.3em',
});

export const error = style({
  margin: 0,
  fontSize: fontSize.sm,
  color: vars.color.error,
});
