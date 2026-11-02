import { style } from '@vanilla-extract/css';
import { vars } from '@/theme/vars.css';
import { fadeIn, fast } from '@/theme/animations.css';

export const tooltipPortal = style({
  position: 'absolute',
  top: 0,
  left: 0,
  zIndex: 9500,
  padding: '5px 10px',
  borderRadius: vars.radius.sm,
  fontSize: '0.75rem',
  fontWeight: 500,
  lineHeight: 1.4,
  letterSpacing: '0.01em',
  whiteSpace: 'nowrap',
  pointerEvents: 'none',
  backgroundColor: vars.color.bgSecondary,
  color: vars.color.textPrimary,
  border: `1px solid ${vars.color.accent}`,
  boxShadow: `0 4px 14px rgba(0,0,0,0.3), 0 1px 3px rgba(0,0,0,0.15)`,
  animation: `${fadeIn} ${fast} ease`,
  '@media': {
    '(pointer: coarse)': {
      display: 'none',
    },
  },
});

export const tooltipMultiline = style({
  whiteSpace: 'pre-line',
  maxWidth: '260px',
});

export const arrow = style({
  position: 'absolute',
  width: 0,
  height: 0,
  zIndex: -1,
});

export const arrowUp = style({
  borderLeft: '4px solid transparent',
  borderRight: '4px solid transparent',
  borderBottom: `4px solid ${vars.color.accent}`,
});

export const arrowDown = style({
  borderLeft: '4px solid transparent',
  borderRight: '4px solid transparent',
  borderTop: `4px solid ${vars.color.accent}`,
});

export const arrowLeft = style({
  borderTop: '4px solid transparent',
  borderBottom: '4px solid transparent',
  borderRight: `4px solid ${vars.color.accent}`,
});

export const arrowRight = style({
  borderTop: '4px solid transparent',
  borderBottom: '4px solid transparent',
  borderLeft: `4px solid ${vars.color.accent}`,
});
