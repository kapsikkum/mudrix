import { style } from '@vanilla-extract/css';
import { vars } from '@/theme/vars.css';

export const note = style({
  margin: 0,
  fontSize: '0.8rem',
  lineHeight: 1.5,
  color: vars.color.textMuted,
});

export const group = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '8px',
});

export const groupTitle = style({
  fontSize: '0.85rem',
  fontWeight: 600,
  color: vars.color.textPrimary,
});

export const swatches = style({
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  gap: '8px',
});

export const swatch = style({
  width: '28px',
  height: '28px',
  borderRadius: '50%',
  border: `2px solid transparent`,
  cursor: 'pointer',
  padding: 0,
  selectors: {
    '&[aria-pressed="true"]': { borderColor: vars.color.textPrimary },
    '&:disabled': { opacity: 0.5, cursor: 'not-allowed' },
  },
});

export const hexInput = style({
  width: '110px',
});

export const grid = style({
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(88px, 1fr))',
  gap: '8px',
});

export const tile = style({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '6px',
  minHeight: '88px',
  padding: '8px 6px',
  borderRadius: vars.radius.sm,
  border: `2px solid ${vars.color.border}`,
  backgroundColor: vars.color.bgTertiary,
  color: vars.color.textPrimary,
  fontSize: '0.72rem',
  textAlign: 'center',
  cursor: 'pointer',
  selectors: {
    '&:hover': { backgroundColor: vars.color.bgHover },
    '&[aria-pressed="true"]': { borderColor: vars.color.accent },
    '&:disabled': { opacity: 0.5, cursor: 'not-allowed' },
  },
});

export const tileImage = style({
  width: '56px',
  height: '56px',
  objectFit: 'contain',
  pointerEvents: 'none',
});

export const tileWide = style({
  width: '100%',
  height: '28px',
  objectFit: 'cover',
  borderRadius: '4px',
  pointerEvents: 'none',
});
