import { style } from '@vanilla-extract/css';
import { vars } from '@/theme/vars.css';
import { fontSize } from '@/theme/typeScale';

export const filters = style({
  display: 'flex',
  flexWrap: 'wrap',
  gap: '6px',
  marginBottom: '12px',
});

export const chip = style({
  padding: '4px 12px',
  borderRadius: vars.radius.pill,
  border: `1px solid ${vars.color.border}`,
  background: 'none',
  color: vars.color.textMuted,
  fontSize: fontSize.rem80,
  cursor: 'pointer',
  selectors: {
    '&:hover': { color: vars.color.textPrimary },
  },
});

export const chipActive = style([
  chip,
  {
    borderColor: vars.color.accent,
    color: vars.color.textPrimary,
    backgroundColor: vars.color.bgTertiary,
  },
]);

export const list = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '2px',
});

export const row = style({
  display: 'flex',
  alignItems: 'flex-start',
  gap: '10px',
  padding: '8px 4px',
  borderBottom: `1px solid ${vars.color.border}`,
});

export const icon = style({
  flexShrink: 0,
  marginTop: '2px',
  color: vars.color.textMuted,
});

export const text = style({
  flex: 1,
  minWidth: 0,
  fontSize: fontSize.rem90,
  lineHeight: 1.4,
  color: vars.color.textSecondary,
  overflowWrap: 'anywhere',
});

export const actor = style({
  fontWeight: 600,
  color: vars.color.textPrimary,
});

export const time = style({
  flexShrink: 0,
  fontSize: fontSize.rem78,
  color: vars.color.textMuted,
  whiteSpace: 'nowrap',
  marginTop: '2px',
});

export const footer = style({
  display: 'flex',
  justifyContent: 'center',
  padding: '16px 0 4px',
  color: vars.color.textMuted,
  fontSize: fontSize.rem85,
});
