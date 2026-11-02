import { style } from '@vanilla-extract/css';
import { vars } from '@/theme/vars.css';

export const popover = style({
  position: 'fixed',
  zIndex: 9000,
  minWidth: '220px',
  maxWidth: '320px',
  maxHeight: '360px',
  overflowY: 'auto',
  overscrollBehavior: 'contain',
  backgroundColor: vars.color.bgSecondary,
  border: `1px solid ${vars.color.border}`,
  borderRadius: vars.radius.md,
  boxShadow: '0 8px 28px rgba(0,0,0,0.35)',
  padding: '8px',
  display: 'flex',
  flexDirection: 'column',
  gap: '4px',
});

export const popoverMatchWidth = style({
  minWidth: 0,
  maxWidth: 'none',
  width: 'max-content',
});

export const popoverContentWidth = style({
  minWidth: 0,
  maxWidth: 'none',
  width: 'max-content',
});

export const popoverDense = style({
  padding: '4px',
  gap: '2px',
});
