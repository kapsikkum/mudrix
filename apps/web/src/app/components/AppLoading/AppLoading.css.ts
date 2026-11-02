import { style, keyframes } from '@vanilla-extract/css';
import { vars } from '@/theme/vars.css';
import { slow } from '@/theme/animations.css';

const fadeOut = keyframes({
  from: { opacity: 1 },
  to: { opacity: 0, pointerEvents: 'none' },
});

export const overlay = style({
  position: 'fixed',
  inset: 0,
  zIndex: 9999,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '20px',
  backgroundColor: vars.color.bgPrimary,
  transition: `opacity ${slow} ease`,
});

export const overlayHiding = style({
  animationName: fadeOut,
  animationDuration: slow,
  animationFillMode: 'forwards',
});

export const text = style({
  color: vars.color.textMuted,
  fontSize: '0.9rem',
  fontStyle: 'italic',
});
