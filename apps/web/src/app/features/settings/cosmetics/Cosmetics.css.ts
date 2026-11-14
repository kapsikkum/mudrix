import { style } from '@vanilla-extract/css';
import { vars } from '@/theme/vars.css';
import { fontSize } from '@/theme/typeScale';

export const label = style({
  fontSize: fontSize.rem74,
  fontWeight: 700,
  letterSpacing: '0.04em',
  textTransform: 'uppercase',
  color: vars.color.textMuted,
  margin: '8px 0',
});

export const grid = style({
  display: 'flex',
  flexWrap: 'wrap',
  gap: '8px',
});

export const tile = style({
  width: '88px',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: '4px',
  padding: '6px',
  background: 'none',
  border: '1px solid transparent',
  borderRadius: vars.radius.md,
  color: vars.color.textSecondary,
  cursor: 'pointer',
  selectors: {
    '&:hover': { backgroundColor: vars.color.bgHover },
  },
});

export const tileSelected = style({
  borderColor: vars.color.accent,
  backgroundColor: vars.color.bgTertiary,
  color: vars.color.textPrimary,
});

export const tileArt = style({
  width: '56px',
  height: '56px',
  objectFit: 'contain',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
});

export const tileName = style({
  maxWidth: '100%',
  fontSize: fontSize.rem76,
  textAlign: 'center',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});

export const packBlock = style({
  marginTop: '12px',
});

export const packHead = style({
  display: 'flex',
  alignItems: 'baseline',
  gap: '8px',
  marginBottom: '6px',
  minWidth: 0,
});

export const packName = style({
  fontSize: fontSize.rem85,
  fontWeight: 600,
  color: vars.color.textPrimary,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});

export const packSource = style({
  fontSize: fontSize.rem76,
  color: vars.color.textMuted,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});
