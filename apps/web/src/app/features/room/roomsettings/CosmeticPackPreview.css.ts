import { style } from '@vanilla-extract/css';
import { vars } from '@/theme/vars.css';
import { fontSize } from '@/theme/typeScale';

export const grid = style({
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
  gap: '14px',
});

// Nameplates are wide strips, so they get a row each, side by side only on wide screens.
export const gridWide = style({
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
  gap: '14px',
});

export const item = style({
  margin: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: '6px',
  minWidth: 0,
});

const tileBase = {
  position: 'relative',
  overflow: 'hidden',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  backgroundColor: vars.color.bgTertiary,
  border: `1px solid ${vars.color.border}`,
  borderRadius: vars.radius.md,
} as const;

export const decorationTile = style({ ...tileBase, aspectRatio: '1 / 1' });

// Effects are drawn on a profile card, which is tall.
export const effectTile = style({ ...tileBase, aspectRatio: '450 / 880' });

export const nameplateTile = style({ ...tileBase, padding: '6px' });

export const frameTile = style({ ...tileBase, aspectRatio: '1 / 1' });

export const art = style({
  width: '100%',
  height: '100%',
  objectFit: 'contain',
  display: 'block',
});

// A stand-in avatar for a decoration to sit around.
export const sampleAvatar = style({
  position: 'absolute',
  width: '62%',
  height: '62%',
  borderRadius: '50%',
  backgroundColor: vars.color.bgHover,
});

export const decorationImg = style({
  position: 'relative',
  width: '100%',
  height: '100%',
  objectFit: 'contain',
  display: 'block',
});

export const caption = style({
  fontSize: fontSize.rem76,
  color: vars.color.textSecondary,
  textAlign: 'center',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});

export const footer = style({
  display: 'flex',
  gap: '8px',
  justifyContent: 'flex-end',
});

export const sectionHeading = style({
  fontSize: fontSize.rem74,
  fontWeight: 700,
  letterSpacing: '0.04em',
  textTransform: 'uppercase',
  color: vars.color.textMuted,
  margin: '4px 0 8px',
});
