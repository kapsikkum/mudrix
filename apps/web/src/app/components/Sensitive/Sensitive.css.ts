import { globalStyle, style } from '@vanilla-extract/css';

export const sensitive = style({});

// Streamer mode (html[data-streamer]): private details blur and can't be selected or clicked.
globalStyle(`html[data-streamer="on"] ${sensitive}`, {
  filter: 'blur(7px)',
  userSelect: 'none',
  pointerEvents: 'none',
});
