import { style } from '@vanilla-extract/css';
import { vars } from '@/theme/vars.css';
import { fontSize } from '@/theme/typeScale';

export const levelControl = style({
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  justifyContent: 'flex-end',
});

export const customInput = style({
  width: '64px',
  padding: '6px 8px',
  backgroundColor: vars.color.bgInput,
  color: vars.color.textPrimary,
  border: `1px solid ${vars.color.border}`,
  borderRadius: vars.radius.sm,
  fontSize: fontSize.rem90,
  outline: 'none',
  appearance: 'none',
  MozAppearance: 'textfield',
  textAlign: 'right',
  '::-webkit-outer-spin-button': {
    appearance: 'none',
    margin: 0,
  },
  '::-webkit-inner-spin-button': {
    appearance: 'none',
    margin: 0,
  },
});

export const invalidInput = style({
  borderColor: vars.color.error,
});

export const note = style({
  fontSize: fontSize.rem80,
  color: vars.color.textMuted,
  marginTop: '-16px',
  marginBottom: '24px',
});

export const errorNote = style({
  fontSize: fontSize.rem80,
  color: vars.color.error,
  marginBottom: '16px',
});
