import { style } from '@vanilla-extract/css';
import { vars } from '@/theme/vars.css';

export const levelControl = style({
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  flexShrink: 0,
});

export const customInput = style({
  width: '80px',
  padding: '8px 12px',
  backgroundColor: vars.color.bgInput,
  color: vars.color.textPrimary,
  border: `1px solid ${vars.color.border}`,
  borderRadius: vars.radius.sm,
  fontSize: '0.9rem',
  outline: 'none',
  appearance: 'none',
  MozAppearance: 'textfield',
  selectors: {
    '&:focus': { borderColor: vars.color.accent },
    '&::-webkit-outer-spin-button': { WebkitAppearance: 'none', margin: 0 },
    '&::-webkit-inner-spin-button': { WebkitAppearance: 'none', margin: 0 },
    '&::-moz-inner-spin-button': { MozAppearance: 'none', margin: 0 },
  },
});

export const invalidInput = style({
  borderColor: vars.color.danger,
});

export const note = style({
  fontSize: '0.8rem',
  color: vars.color.textMuted,
  marginTop: '-16px',
  marginBottom: '24px',
});

export const errorNote = style({
  fontSize: '0.8rem',
  color: vars.color.error,
  marginBottom: '16px',
});
