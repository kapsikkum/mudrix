import { style } from '@vanilla-extract/css';
import { vars } from '@/theme/vars.css';

const NARROW = '(max-width: 768px)';

/** Label on the left, control on the right; stacks on phones. */
export const fieldRow = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '16px',
  padding: '12px 0',
  '@media': {
    [NARROW]: { flexDirection: 'column', alignItems: 'stretch', gap: '8px' },
  },
});

export const fieldControl = style({
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  width: '280px',
  minWidth: 0,
  flexShrink: 0,
  '@media': {
    [NARROW]: { width: '100%' },
  },
});

export const selectWrap = style({
  flex: 1,
  minWidth: 0,
  display: 'flex',
  flexDirection: 'column',
});

export const hint = style({
  fontSize: '0.82rem',
  color: vars.color.textMuted,
  lineHeight: 1.5,
  margin: '0 0 8px',
});

export const buttonRow = style({
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  gap: '8px',
  marginTop: '4px',
});

export const button = style({
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '6px',
  padding: '10px 14px',
  fontSize: '0.9rem',
  fontWeight: 500,
  color: vars.color.textPrimary,
  backgroundColor: vars.color.bgTertiary,
  borderRadius: vars.radius.sm,
  border: 'none',
  cursor: 'pointer',
  whiteSpace: 'nowrap',
  flexShrink: 0,
  ':hover': {
    backgroundColor: vars.color.bgHover,
  },
  ':disabled': {
    opacity: 0.5,
    cursor: 'not-allowed',
  },
});

export const iconButton = style([
  button,
  {
    padding: '8px',
  },
]);

export const errorText = style({
  color: vars.color.error,
  fontSize: '0.85rem',
  margin: '8px 0 0',
});

export const warningText = style({
  display: 'flex',
  alignItems: 'flex-start',
  gap: '6px',
  color: vars.color.warning,
  fontSize: '0.82rem',
  lineHeight: 1.5,
  margin: '0 0 8px',
});

export const meterTrack = style({
  position: 'relative',
  height: '10px',
  marginTop: '12px',
  borderRadius: '5px',
  overflow: 'hidden',
  backgroundColor: vars.color.bgTertiary,
});

export const meterBar = style({
  position: 'absolute',
  inset: 0,
  backgroundColor: vars.color.success,
  transformOrigin: 'left center',
  transform: 'scaleX(0)',
  selectors: {
    // The track carries data-clip while the signal has recently hit full scale.
    [`${meterTrack}[data-clip="true"] > &`]: { backgroundColor: vars.color.error },
  },
});

export const meterCaption = style({
  display: 'flex',
  justifyContent: 'space-between',
  marginTop: '4px',
  fontSize: '0.75rem',
  color: vars.color.textMuted,
});

export const clipLabel = style({
  color: vars.color.error,
  fontWeight: 600,
  visibility: 'hidden',
  selectors: {
    '&[data-clip="true"]': { visibility: 'visible' },
  },
});

export const preview = style({
  display: 'block',
  width: '100%',
  maxWidth: '320px',
  aspectRatio: '16 / 9',
  marginTop: '12px',
  borderRadius: vars.radius.md,
  backgroundColor: vars.color.bgTertiary,
  objectFit: 'cover',
  transform: 'scaleX(-1)',
  selectors: {
    '&[hidden]': { display: 'none' },
  },
});

export const soundRow = style({
  display: 'flex',
  gap: '8px',
  alignItems: 'center',
  padding: '8px 0',
});

export const soundLabel = style({
  flexShrink: 0,
  minWidth: '96px',
});

export const soundSelect = style({
  flex: 1,
  minWidth: 0,
});

export const volumeSlider = style({
  flex: 1,
  minWidth: 0,
});

export const kindRow = style({
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  padding: '6px 0',
});

export const kindLabel = style({
  flex: 1,
  minWidth: 0,
  fontSize: '0.95rem',
  fontWeight: 500,
  color: vars.color.textPrimary,
  '@media': {
    [NARROW]: { flex: '0 0 96px' },
  },
});

export const kindSelect = style({
  width: '260px',
  minWidth: 0,
  display: 'flex',
  flexDirection: 'column',
  '@media': {
    [NARROW]: { width: 'auto', flex: 1 },
  },
});

export const soundButton = style([button, { padding: '8px 12px' }]);

export const resetRow = style({
  marginTop: '8px',
});
