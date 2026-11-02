import { style } from '@vanilla-extract/css';
import { vars } from '@/theme/vars.css';
import { fast } from '@/theme/animations.css';

export const wrap = style({
  position: 'relative',
  display: 'inline-flex',
});

const dot = style({
  position: 'absolute',
  right: '-3px',
  bottom: '-2px',
  width: '7px',
  height: '7px',
  borderRadius: '50%',
  transition: `background-color ${fast}`,
});

export const dotIdle = style([dot, { backgroundColor: vars.color.danger }]);

export const dotHeld = style([dot, { backgroundColor: vars.color.success }]);
