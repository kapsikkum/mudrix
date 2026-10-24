import { style } from '@vanilla-extract/css';
import { vars } from '@/theme/vars.css';

export const body = style({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: '14px',
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
  fontSize: '0.92rem',
  lineHeight: 1.5,
  color: vars.color.textMuted,
  maxWidth: '360px',
});

export const steps = style({
  margin: 0,
  paddingLeft: '20px',
  textAlign: 'left',
  fontSize: '0.9rem',
  lineHeight: 1.6,
  color: vars.color.textPrimary,
});

export const checkCode = style({
  fontSize: '2.4rem',
  fontWeight: 700,
  letterSpacing: '0.3em',
  color: vars.color.textPrimary,
  fontVariantNumeric: 'tabular-nums',
});

export const codeInput = style({
  width: '120px',
  textAlign: 'center',
  fontSize: '1.4rem',
  letterSpacing: '0.3em',
});

export const error = style({
  margin: 0,
  fontSize: '0.88rem',
  color: vars.color.error,
});
