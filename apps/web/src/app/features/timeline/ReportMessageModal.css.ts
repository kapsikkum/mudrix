import { style } from '@vanilla-extract/css';
import { vars } from '@/theme/vars.css';
import { fast } from '@/theme/animations.css';

export const dialog = style({
  selectors: {
    '&&': {
      borderRadius: vars.radius.lg,
      boxShadow: '0 24px 64px rgba(0, 0, 0, 0.5)',
    },
  },
});

export const dialogBody = style({
  selectors: {
    '&&': {
      gap: 0,
      padding: '16px',
    },
  },
});

export const infoDesc = style({
  fontSize: '0.85rem',
  lineHeight: '1.5',
  color: vars.color.textMuted,
  marginBottom: '14px',
});

export const reasonInput = style({
  width: '100%',
  boxSizing: 'border-box',
  resize: 'none',
  minHeight: '96px',
  padding: '10px 12px',
  backgroundColor: vars.color.bgInput,
  color: vars.color.textPrimary,
  border: `1px solid ${vars.color.border}`,
  borderRadius: vars.radius.md,
  outline: 'none',
  fontSize: '0.9rem',
  lineHeight: '1.5',
  fontFamily: 'inherit',
  transition: `border-color ${fast}, box-shadow ${fast}`,
  '::placeholder': { color: vars.color.textMuted },
  ':focus': {
    borderColor: vars.color.accent,
    boxShadow: `0 0 0 2px color-mix(in srgb, ${vars.color.accent} 18%, transparent)`,
  },
});

export const footer = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'flex-end',
  gap: '8px',
  marginTop: '14px',
});
