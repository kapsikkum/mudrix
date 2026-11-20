import { style } from '@vanilla-extract/css';
import { vars } from '@/theme/vars.css';
import { fast } from '@/theme/animations.css';
import { fontSize } from '@/theme/typeScale';

export const intro = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '12px',
});

export const bulk = style({
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '8px 16px',
});

export const bulkLabel = style({
  fontSize: fontSize.rem95,
  fontWeight: 500,
  color: vars.color.textPrimary,
});

export const group = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '6px',
  marginTop: '18px',
});

export const groupHeading = style({
  margin: 0,
  fontSize: fontSize.rem82,
  fontWeight: 600,
  color: vars.color.textMuted,
  letterSpacing: '0.01em',
});

export const groupNote = style({
  margin: 0,
  fontSize: fontSize.rem82,
  lineHeight: 1.5,
  color: vars.color.textMuted,
});

export const list = style({
  display: 'flex',
  flexDirection: 'column',
  margin: '4px 0 0',
  padding: 0,
  listStyle: 'none',
  border: `1px solid ${vars.color.border}`,
  borderRadius: vars.radius.md,
  backgroundColor: vars.color.bgSecondary,
  overflow: 'hidden',
});

export const row = style({
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  gap: '8px 12px',
  padding: '10px 12px',
  selectors: {
    '& + &': { borderTop: `1px solid ${vars.color.border}` },
  },
});

export const identity = style({
  display: 'flex',
  alignItems: 'center',
  gap: '12px',
  flex: '1 1 220px',
  minWidth: 0,
});

export const icon = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '32px',
  height: '32px',
  flexShrink: 0,
  borderRadius: vars.radius.sm,
  backgroundColor: vars.color.bgTertiary,
  color: vars.color.textPrimary,
});

export const text = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '1px',
  minWidth: 0,
});

export const name = style({
  fontSize: fontSize.rem95,
  fontWeight: 500,
  lineHeight: 1.35,
  color: vars.color.textPrimary,
});

export const description = style({
  fontSize: fontSize.rem82,
  lineHeight: 1.4,
  color: vars.color.textMuted,
});

export const segmented = style({
  display: 'inline-flex',
  flexShrink: 0,
  padding: '2px',
  gap: '2px',
  borderRadius: vars.radius.sm,
  border: `1px solid ${vars.color.border}`,
  backgroundColor: vars.color.bgTertiary,
  '@media': {
    // Narrow settings page: the control moves under the name and spans the row.
    '(max-width: 520px)': { width: '100%', marginLeft: 0 },
  },
});

export const segment = style({
  flex: '1 1 0',
  minWidth: '60px',
  minHeight: '28px',
  padding: '4px 12px',
  border: 'none',
  borderRadius: '4px',
  background: 'none',
  color: vars.color.textMuted,
  fontSize: fontSize.rem82,
  fontWeight: 500,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
  transition: `background-color ${fast}, color ${fast}`,
  ':hover': { color: vars.color.textPrimary, backgroundColor: vars.color.bgHover },
  ':focus-visible': { outline: `2px solid ${vars.color.accent}`, outlineOffset: '1px' },
  selectors: {
    '&[aria-checked="true"]': {
      backgroundColor: vars.color.accent,
      color: vars.color.onAccent,
    },
  },
  '@media': {
    '(max-width: 520px)': { minHeight: '36px' },
  },
});
