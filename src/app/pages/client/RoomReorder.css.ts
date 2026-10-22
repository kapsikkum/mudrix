import { style } from '@vanilla-extract/css';
import { vars } from '@/theme/vars.css';

export const row = style({
  position: 'relative',
  height: '100%',
});

export const insertLine = style({
  position: 'absolute',
  left: '8px',
  right: '8px',
  height: 0,
  borderTop: `2px dotted ${vars.color.accent}`,
  pointerEvents: 'none',
  zIndex: 1,
  selectors: {
    '&[data-position="before"]': { top: '-1px' },
    '&[data-position="after"]': { bottom: '-1px' },
  },
});

export const overlay = style({
  height: '100%',
  borderRadius: vars.radius.md,
  backgroundColor: vars.color.bgTertiary,
  border: `1px solid color-mix(in srgb, ${vars.color.accent} 45%, transparent)`,
  boxShadow: '0 10px 28px rgba(0, 0, 0, 0.4)',
  overflow: 'hidden',
  cursor: 'grabbing',
  pointerEvents: 'none',
});
