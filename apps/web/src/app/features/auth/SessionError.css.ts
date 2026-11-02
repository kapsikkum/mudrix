import { style } from '@vanilla-extract/css';
import { vars } from '@/theme/vars.css';

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
  fontSize: '1.1rem',
  fontWeight: 600,
  color: vars.color.textPrimary,
  margin: 0,
});

export const details = style({
  fontSize: '0.8rem',
  color: vars.color.textMuted,
  fontFamily: 'monospace',
  backgroundColor: vars.color.bgTertiary,
  padding: '8px 12px',
  borderRadius: vars.radius.sm,
  wordBreak: 'break-word',
  maxWidth: '100%',
  margin: 0,
  textAlign: 'left',
});

export const actions = style({
  display: 'flex',
  gap: '8px',
  marginTop: '4px',
  flexWrap: 'wrap',
  justifyContent: 'center',
});
