import { style } from '@vanilla-extract/css';
import { vars } from '@/theme/vars.css';
import { fast } from '@/theme/animations.css';

export const THUMB_SIZE = 16;
const TRACK_HEIGHT = 6;

export const root = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '6px',
  width: '240px',
});

export const ticks = style({
  position: 'relative',
  height: '16px',
});

export const tick = style({
  position: 'absolute',
  top: 0,
  transform: 'translateX(-50%)',
  padding: 0,
  border: 'none',
  background: 'none',
  fontSize: '0.72rem',
  fontVariantNumeric: 'tabular-nums',
  lineHeight: '16px',
  color: vars.color.textMuted,
  cursor: 'pointer',
  transition: `color ${fast}`,
  ':hover': { color: vars.color.textPrimary },
});

export const tickDefault = style([tick, { color: vars.color.accent }]);

const track = {
  height: `${TRACK_HEIGHT}px`,
  borderRadius: `${TRACK_HEIGHT / 2}px`,
  backgroundColor: vars.color.bgTertiary,
  border: `1px solid ${vars.color.border}`,
};

const thumb = {
  width: `${THUMB_SIZE}px`,
  height: `${THUMB_SIZE}px`,
  borderRadius: '50%',
  backgroundColor: vars.color.accent,
  border: `2px solid ${vars.color.bgSecondary}`,
  boxShadow: '0 1px 3px rgba(0, 0, 0, 0.35)',
  cursor: 'pointer',
};

export const input = style({
  WebkitAppearance: 'none',
  appearance: 'none',
  width: '100%',
  height: `${THUMB_SIZE}px`,
  margin: 0,
  background: 'transparent',
  cursor: 'pointer',
  selectors: {
    '&::-webkit-slider-runnable-track': track,
    '&::-webkit-slider-thumb': {
      ...thumb,
      WebkitAppearance: 'none',
      marginTop: `${-(THUMB_SIZE - TRACK_HEIGHT) / 2 - 1}px`,
    },
    '&::-moz-range-track': track,
    '&::-moz-range-thumb': thumb,
    '&:focus-visible': { outline: 'none' },
    '&:focus-visible::-webkit-slider-thumb': {
      boxShadow: `0 0 0 3px color-mix(in srgb, ${vars.color.accent} 35%, transparent)`,
    },
    '&:focus-visible::-moz-range-thumb': {
      boxShadow: `0 0 0 3px color-mix(in srgb, ${vars.color.accent} 35%, transparent)`,
    },
  },
});
