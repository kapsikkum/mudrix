import { style } from '@vanilla-extract/css';
import { vars } from '@/theme/vars.css';
import { med } from '@/theme/animations.css';

// Resting fills come from the active themes logo palette

const TRANSITION = `fill ${med} ease`;

export const svg = style({
  cursor: 'default',
  overflow: 'visible',
  filter: 'none',
});

const makePolygon = (baseFill: string) =>
  style({
    fill: baseFill,
    transition: TRANSITION,
    ':hover': {
      fill: vars.logo.hover,
      filter: `drop-shadow(0 0 6px ${vars.logo.hoverGlow})`,
      cursor: 'default',
    },
  });

export const p0 = makePolygon(vars.logo.p0);
export const p1 = makePolygon(vars.logo.p1);
export const p2 = makePolygon(vars.logo.p2);
export const p3 = makePolygon(vars.logo.p3);
export const p4 = makePolygon(vars.logo.p4);
export const p5 = makePolygon(vars.logo.p5);
