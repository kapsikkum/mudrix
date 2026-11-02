import { style } from '@vanilla-extract/css';
import { vars } from '@/theme/vars.css';
import { fast } from '@/theme/animations.css';

export const typeList = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '8px',
});

const typeOptionBase = style({
  display: 'flex',
  alignItems: 'center',
  gap: '12px',
  boxSizing: 'border-box',
  width: '100%',
  padding: '11px 12px',
  borderRadius: vars.radius.md,
  border: `1px solid ${vars.color.border}`,
  background: vars.color.bgSecondary,
  color: vars.color.textPrimary,
  fontFamily: vars.font.body,
  fontSize: '0.9rem',
  fontWeight: 500,
  lineHeight: '1.2',
  textAlign: 'left',
  cursor: 'pointer',
  transition: `background-color ${fast}, border-color ${fast}`,
  ':hover': {
    background: vars.color.bgHover,
  },
});

export const typeOption = style([typeOptionBase]);

export const typeOptionActive = style([
  typeOptionBase,
  {
    borderColor: vars.color.accent,
    background: vars.color.bgActive,
    ':hover': {
      background: vars.color.bgActive,
    },
  },
]);

export const typeIcon = style({
  flexShrink: 0,
  color: vars.color.textSecondary,
});

export const typeIconActive = style({
  flexShrink: 0,
  color: vars.color.accent,
});

export const typeText = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '3px',
  minWidth: 0,
});

export const typeNote = style({
  color: vars.color.textMuted,
  fontSize: '0.8rem',
  fontWeight: 400,
  lineHeight: '1.3',
});

export const typeRadio = style({
  flexShrink: 0,
  boxSizing: 'border-box',
  width: '16px',
  height: '16px',
  borderRadius: '50%',
  border: `2px solid ${vars.color.border}`,
  transition: `border-color ${fast}`,
});

export const typeRadioActive = style({
  flexShrink: 0,
  position: 'relative',
  boxSizing: 'border-box',
  width: '16px',
  height: '16px',
  borderRadius: '50%',
  border: `2px solid ${vars.color.accent}`,
  transition: `border-color ${fast}`,
  '::after': {
    content: '',
    position: 'absolute',
    top: '2px',
    left: '2px',
    right: '2px',
    bottom: '2px',
    borderRadius: '50%',
    backgroundColor: vars.color.accent,
  },
});
