import { style } from '@vanilla-extract/css';
import { vars } from '@/theme/vars.css';

export const handle = style({
  position: 'absolute',
  top: 0,
  bottom: 0,
  left: 0,
  width: 6,
  cursor: 'col-resize',
  touchAction: 'none',
  userSelect: 'none',
  zIndex: 10,
  selectors: {
    '&::after': {
      content: '',
      position: 'absolute',
      top: 0,
      bottom: 0,
      left: 0,
      width: 2,
      backgroundColor: vars.color.accent,
      opacity: 0,
      transition: 'opacity 120ms ease',
    },
    '&:hover::after': {
      opacity: 1,
    },
    '&[data-dragging="true"]::after': {
      opacity: 1,
    },
  },
});
