import { globalStyle, style } from '@vanilla-extract/css';
import { vars } from '@/theme/vars.css';

export const THUMB_SIZE = 16;
const TRACK_HEIGHT = 6;

/** The browser's own range control, tinted with the accent. Layout comes from the caller's class. */
export const native = style({
  accentColor: vars.color.accent,
});

const trackPart = {
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

export const track = style({
  WebkitAppearance: 'none',
  appearance: 'none',
  width: '100%',
  height: `${THUMB_SIZE}px`,
  margin: 0,
  background: 'transparent',
  cursor: 'pointer',
  selectors: {
    '&::-webkit-slider-runnable-track': trackPart,
    '&::-webkit-slider-thumb': {
      ...thumb,
      WebkitAppearance: 'none',
      marginTop: `${-(THUMB_SIZE - TRACK_HEIGHT) / 2 - 1}px`,
    },
    '&::-moz-range-track': trackPart,
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

/** Drawn track with the filled part up to `--fill`, for the call volume sliders. */
export const fill = style({
  flex: 1,
  minWidth: 0,
  height: '16px',
  margin: 0,
  appearance: 'none',
  background: 'transparent',
  cursor: 'pointer',
  ':disabled': { opacity: 0.4, cursor: 'not-allowed' },
  ':focus-visible': { outline: `2px solid ${vars.color.accent}`, outlineOffset: '2px' },
});

const fillTrack = {
  height: '4px',
  borderRadius: '2px',
  background: `linear-gradient(to right, ${vars.color.accent} var(--volume, 100%), ${vars.color.border} var(--volume, 100%))`,
};
const fillThumb = {
  appearance: 'none',
  width: '14px',
  height: '14px',
  marginTop: '-5px',
  borderRadius: '50%',
  border: 'none',
  backgroundColor: '#fff',
  boxShadow: '0 1px 3px rgba(0, 0, 0, 0.4)',
} as const;

globalStyle(`${fill}::-webkit-slider-runnable-track`, fillTrack);
globalStyle(`${fill}::-moz-range-track`, fillTrack);
globalStyle(`${fill}::-webkit-slider-thumb`, fillThumb);
globalStyle(`${fill}::-moz-range-thumb`, { ...fillThumb, marginTop: 0 });
globalStyle(`${fill}:focus-visible::-webkit-slider-thumb`, {
  boxShadow: `0 0 0 3px rgba(${vars.color.accentRgb}, 0.45)`,
});
globalStyle(`${fill}:focus-visible::-moz-range-thumb`, {
  boxShadow: `0 0 0 3px rgba(${vars.color.accentRgb}, 0.45)`,
});
