import { style } from '@vanilla-extract/css';
import { vars } from '@/theme/vars.css';
import { fast } from '@/theme/animations.css';

export const button = style({
  position: 'relative',
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
  overflow: 'hidden',
  backgroundColor: 'transparent',
  color: vars.color.accent,
  transition: `background-color ${fast}, color ${fast}`,
  ':hover': {
    backgroundColor: vars.color.bgHover,
  },
});

export const percent = style({
  fontSize: '0.7rem',
  fontWeight: 600,
  fontVariantNumeric: 'tabular-nums',
});

/** The download's progress, a thin line along the bottom of the button. */
export const bar = style({
  position: 'absolute',
  left: 0,
  bottom: 0,
  height: '3px',
  backgroundColor: vars.color.accent,
  transition: `width ${fast} linear`,
});
