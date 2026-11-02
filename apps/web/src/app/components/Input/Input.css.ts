import { style } from '@vanilla-extract/css';
import { vars } from '@/theme/vars.css';
import { fast } from '@/theme/animations.css';

const inputBase = style({
  width: '100%',
  padding: '9px 12px',
  backgroundColor: vars.color.bgInput,
  color: vars.color.textPrimary,
  border: `1px solid ${vars.color.border}`,
  borderRadius: vars.radius.sm,
  fontSize: '0.9rem',
  fontFamily: vars.font.body,
  outline: 'none',
  cursor: 'text',
  transition: `border-color ${fast}`,
  '::placeholder': { color: vars.color.textMuted },
  ':focus': { borderColor: vars.color.accent },
  ':disabled': { opacity: 0.6, cursor: 'not-allowed' },
});

export const input = inputBase;

export const textarea = style([
  inputBase,
  {
    resize: 'vertical',
    lineHeight: '1.5',
    minHeight: '80px',
  },
]);

export const wrapWithToggle = style({
  position: 'relative',
});

export const inputWrap = style({
  position: 'relative',
  width: '100%',
});

export const inputWithToggle = style({
  paddingRight: '40px',
});

export const passwordToggle = style({
  position: 'absolute',
  top: '50%',
  right: '6px',
  transform: 'translateY(-50%)',
});

export const inputWithLeadingIcon = style({
  paddingLeft: '32px',
});

export const leadingIcon = style({
  position: 'absolute',
  top: '50%',
  left: '10px',
  transform: 'translateY(-50%)',
  display: 'flex',
  alignItems: 'center',
  color: vars.color.textMuted,
  pointerEvents: 'none',
});
