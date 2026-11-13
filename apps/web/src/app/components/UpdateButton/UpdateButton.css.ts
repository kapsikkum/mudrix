import { style } from '@vanilla-extract/css';
import { vars } from '@/theme/vars.css';
import { fast } from '@/theme/animations.css';

export const button = style({
  width: '32px',
  height: '32px',
  borderRadius: vars.radius.sm,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
  border: 'none',
  padding: 0,
  flexShrink: 0,
  backgroundColor: 'transparent',
  color: vars.color.accent,
  transition: `background-color ${fast}, color ${fast}`,
  ':hover': {
    backgroundColor: vars.color.bgHover,
  },
});

export const percent = style({
  fontSize: '0.7rem',
  fontWeight: 700,
  fontVariantNumeric: 'tabular-nums',
});
