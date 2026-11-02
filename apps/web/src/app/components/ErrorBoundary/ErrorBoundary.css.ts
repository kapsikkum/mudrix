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
});

export const errorBox = style({
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

export const message = style({
  fontSize: '0.85rem',
  color: vars.color.textMuted,
  fontFamily: 'monospace',
  backgroundColor: vars.color.bgTertiary,
  padding: '8px 12px',
  borderRadius: vars.radius.sm,
  wordBreak: 'break-word',
  maxWidth: '100%',
});

export const refreshBtn = style({
  padding: '8px 20px',
  borderRadius: '8px',
  border: 'none',
  cursor: 'pointer',
  fontWeight: 600,
  fontSize: '0.9rem',
  backgroundColor: vars.color.accent,
  color: '#fff',
  ':hover': {
    backgroundColor: vars.color.accentHover,
  },
});
