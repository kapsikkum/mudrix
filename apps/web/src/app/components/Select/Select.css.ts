import { style } from '@vanilla-extract/css';
import { vars } from '@/theme/vars.css';
import { fast } from '@/theme/animations.css';

const triggerBase = style({
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  borderRadius: vars.radius.sm,
  fontFamily: vars.font.body,
  textAlign: 'left',
  cursor: 'pointer',
  flexShrink: 0,
  transition: `border-color ${fast}`,
  selectors: {
    '&:focus-visible': {
      borderColor: vars.color.accent,
      outline: 'none',
    },
  },
});

export const trigger = style([triggerBase]);

export const triggerMd = style([
  triggerBase,
  {
    padding: '8px 12px',
    fontSize: '0.9rem',
    backgroundColor: vars.color.bgInput,
    color: vars.color.textPrimary,
    border: `1px solid ${vars.color.border}`,
  },
]);
export const icon = style({
  display: 'flex',
  alignItems: 'center',
  flexShrink: 0,
  color: vars.color.textMuted,
});

export const triggerPill = style([
  triggerBase,
  {
    gap: '6px',
    padding: '2px 8px 2px 6px',
    fontSize: '0.75rem',
    fontWeight: 600,
    textTransform: 'capitalize',
    backgroundColor: vars.color.bgTertiary,
    color: vars.color.textPrimary,
    border: `1px solid ${vars.color.border}`,
  },
]);

export const triggerDisabled = style([
  {
    opacity: 0.5,
    cursor: 'not-allowed',
  },
]);

export const value = style({
  flex: 1,
  minWidth: 0,
  color: vars.color.textPrimary,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});

export const caret = style({
  display: 'flex',
  alignItems: 'center',
  color: vars.color.textMuted,
  flexShrink: 0,
});

export const option = style({
  padding: '6px 8px',
  borderRadius: vars.radius.sm,
  fontSize: '0.9rem',
  color: vars.color.textPrimary,
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  cursor: 'pointer',
});

export const optionHighlight = style([
  {
    backgroundColor: vars.color.bgHover,
  },
]);

export const optionSelected = style([
  {
    backgroundColor: vars.color.bgActive,
  },
]);
