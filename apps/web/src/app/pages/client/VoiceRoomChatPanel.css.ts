import { style } from '@vanilla-extract/css';

export const titleIcon = style({
  flexShrink: 0,
});

export const panelBody = style({
  flex: 1,
  minHeight: 0,
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
});
