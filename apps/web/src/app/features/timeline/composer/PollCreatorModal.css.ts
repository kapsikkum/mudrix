import { style } from '@vanilla-extract/css';
import { vars } from '@/theme/vars.css';
import { fast } from '@/theme/animations.css';

export const optionsList = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '8px',
});

export const optionRow = style({
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
});

export const optionInput = style({
  flex: 1,
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

export const removeOptionBtn = style({
  flexShrink: 0,
  width: '30px',
  height: '30px',
  borderRadius: '50%',
  border: 'none',
  background: 'none',
  color: vars.color.textMuted,
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  transition: `background-color ${fast}, color ${fast}`,
  ':hover': {
    backgroundColor: vars.color.bgHover,
    color: vars.color.danger,
  },
  ':disabled': {
    opacity: 0.3,
    cursor: 'default',
  },
});

export const addOptionBtn = style({
  alignSelf: 'flex-start',
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
  padding: '6px 12px',
  borderRadius: vars.radius.md,
  border: `1px dashed ${vars.color.border}`,
  background: 'none',
  color: vars.color.textMuted,
  fontSize: '0.88rem',
  cursor: 'pointer',
  transition: `border-color ${fast}, color ${fast}, background-color ${fast}`,
  ':hover': {
    borderColor: vars.color.accent,
    color: vars.color.accent,
    backgroundColor: `color-mix(in srgb, ${vars.color.accent} 8%, transparent)`,
  },
  ':disabled': {
    opacity: 0.4,
    cursor: 'not-allowed',
  },
});
