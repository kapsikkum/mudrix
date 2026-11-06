import { keyframes, style } from '@vanilla-extract/css';
import { vars } from '@/theme/vars.css';

const sweep = keyframes({
  from: { transform: 'translateX(-100%)' },
  to: { transform: 'translateX(100%)' },
});

export const view = style({
  position: 'relative',
  overflow: 'hidden',
  backgroundColor: vars.color.bgTertiary,
});

export const viewImage = style({
  position: 'relative',
  width: '100%',
  height: '100%',
  objectFit: 'cover',
  display: 'block',
  opacity: 0,
  transition: 'opacity 320ms ease',
});

export const viewImageLoaded = style([viewImage, { opacity: 1 }]);

/** Fills the banner with a shimmer while the image is on its way. */
export const skeleton = style({
  position: 'absolute',
  inset: 0,
  backgroundColor: vars.color.bgTertiary,
  overflow: 'hidden',
  opacity: 1,
  transition: 'opacity 320ms ease',
  pointerEvents: 'none',
  selectors: {
    '&::after': {
      content: '""',
      position: 'absolute',
      inset: 0,
      backgroundImage: `linear-gradient(90deg, transparent, ${vars.color.bgHover}, transparent)`,
      transform: 'translateX(-100%)',
      animation: `${sweep} 1.4s linear infinite`,
    },
  },
});

export const skeletonDone = style([
  skeleton,
  { opacity: 0, selectors: { '&::after': { animation: 'none' } } },
]);

export const picker = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '10px',
  marginBottom: '16px',
});

export const pickerTitle = style({
  margin: 0,
  fontSize: '0.95rem',
  fontWeight: 700,
  color: vars.color.textPrimary,
});

export const pickerPreview = style({
  height: '110px',
  borderRadius: vars.radius.md,
  border: `1px solid ${vars.color.border}`,
});

export const pickerActions = style({ display: 'flex', gap: '8px', flexWrap: 'wrap' });

export const buttonIcon = style({ marginRight: '6px', verticalAlign: '-2px' });

export const swatches = style({ display: 'flex', gap: '8px', flexWrap: 'wrap' });

const swatchBase = style({
  width: '40px',
  height: '28px',
  borderRadius: vars.radius.sm,
  border: '2px solid transparent',
  cursor: 'pointer',
  padding: 0,
});

export const swatch = style([
  swatchBase,
  {
    selectors: {
      '&:hover': { borderColor: vars.color.textMuted },
      '&:focus-visible': { outline: `2px solid ${vars.color.accent}`, outlineOffset: '2px' },
      '&:disabled': { opacity: 0.5, cursor: 'default' },
    },
  },
]);

export const swatchActive = style([swatchBase, { borderColor: vars.color.accent }]);

export const hidden = style({ display: 'none' });

/** The banner across the top of a space's room list. */
export const headerBanner = style({
  height: '84px',
  flexShrink: 0,
  borderBottom: `1px solid ${vars.color.border}`,
});
