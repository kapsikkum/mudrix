import { style } from '@vanilla-extract/css';
import { vars } from '@/theme/vars.css';
import { fast } from '@/theme/animations.css';
import { fontSize } from '@/theme/typeScale';

export const preview = style({
  backgroundColor: vars.color.bgSecondary,
  border: `1px solid ${vars.color.border}`,
  borderRadius: vars.radius.md,
  padding: '10px 0',
  marginBottom: '8px',
  userSelect: 'none',
});

export const previewSender = style({
  fontWeight: 600,
  color: vars.color.accent,
  fontSize: fontSize.rem90,
});

export const swatchRow = style({
  display: 'flex',
  gap: '10px',
  flexWrap: 'wrap',
});

export const swatch = style({
  width: '32px',
  height: '32px',
  borderRadius: vars.radius.md,
  border: `1px solid ${vars.color.border}`,
  padding: 0,
  cursor: 'pointer',
  outline: '2px solid transparent',
  outlineOffset: '2px',
  transition: `outline-color ${fast}, transform ${fast}`,
  ':hover': { transform: 'scale(1.08)' },
  ':focus-visible': { outlineColor: vars.color.accent },
});

export const swatchActive = style([swatch, { outlineColor: vars.color.accent }]);

export const customThemeCard = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '10px',
  padding: '10px 12px',
  borderRadius: vars.radius.md,
  backgroundColor: vars.color.bgSecondary,
  border: `1px solid ${vars.color.border}`,
});

export const customThemeHeader = style({
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
});

export const customThemeSwatch = style({
  width: '24px',
  height: '24px',
  flexShrink: 0,
  borderRadius: '6px',
  border: `1px solid ${vars.color.border}`,
});

export const customThemeName = style({
  flex: 1,
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  color: vars.color.textPrimary,
});

export const customThemeActive = style({
  fontSize: fontSize.rem78,
  fontWeight: 600,
  color: vars.color.accent,
});

export const customThemeEditor = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '12px',
});

export const colorGrid = style({
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
  gap: '10px',
});

export const colorField = style({
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  fontSize: fontSize.rem85,
  color: vars.color.textMuted,
  cursor: 'pointer',
});

export const colorInput = style({
  width: '32px',
  height: '28px',
  padding: 0,
  border: `1px solid ${vars.color.border}`,
  borderRadius: '6px',
  backgroundColor: 'transparent',
  cursor: 'pointer',
});

export const customThemeActions = style({
  display: 'flex',
  flexWrap: 'wrap',
  gap: '8px',
});
