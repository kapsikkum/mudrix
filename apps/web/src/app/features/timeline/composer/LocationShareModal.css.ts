import { style } from '@vanilla-extract/css';
import { vars } from '@/theme/vars.css';
import { fast } from '@/theme/animations.css';

export const input = style({
  width: '100%',
  boxSizing: 'border-box',
  padding: '8px 12px',
  backgroundColor: vars.color.bgInput,
  border: `1px solid ${vars.color.border}`,
  borderRadius: vars.radius.md,
  color: vars.color.textPrimary,
  fontSize: '0.95rem',
  fontFamily: 'inherit',
  outline: 'none',
  transition: `border-color ${fast}, box-shadow ${fast}`,
  ':focus': {
    borderColor: vars.color.accent,
    boxShadow: `0 0 0 2px color-mix(in srgb, ${vars.color.accent} 18%, transparent)`,
  },
  '::placeholder': { color: vars.color.textMuted },
});

export const coordRow = style({
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  gap: '10px',
});

export const status = style({
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  color: vars.color.textSecondary,
  fontSize: '0.9rem',
});

export const errorText = style({
  color: vars.color.danger,
  fontSize: '0.9rem',
});

export const retryBtn = style({
  alignSelf: 'flex-start',
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
  padding: 0,
  border: 'none',
  background: 'none',
  color: vars.color.accent,
  fontSize: '0.88rem',
  cursor: 'pointer',
  ':disabled': { opacity: 0.5, cursor: 'default' },
});
