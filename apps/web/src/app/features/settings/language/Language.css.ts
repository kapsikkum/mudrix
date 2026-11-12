import { style } from '@vanilla-extract/css';
import { vars } from '@/theme/vars.css';
import { fontSize } from '@/theme/typeScale';

export const chips = style({
  display: 'flex',
  flexWrap: 'wrap',
  gap: '8px',
  padding: '4px 0 12px',
});

export const chip = style({
  padding: '6px 14px',
  borderRadius: vars.radius.pill,
  border: `1px solid ${vars.color.border}`,
  backgroundColor: vars.color.bgTertiary,
  color: vars.color.textPrimary,
  fontSize: fontSize.rem90,
  cursor: 'pointer',
  ':hover': { backgroundColor: vars.color.bgHover },
  ':disabled': { cursor: 'default' },
});

export const chipOn = style({
  borderColor: vars.color.accent,
  backgroundColor: vars.color.accent,
  color: vars.color.onAccent,
  ':hover': { backgroundColor: vars.color.accentHover },
});

export const wordList = style({
  display: 'flex',
  flexDirection: 'column',
  maxHeight: '260px',
  overflowY: 'auto',
});

export const wordRow = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '12px',
  padding: '6px 0',
  borderBottom: `1px solid ${vars.color.border}`,
});

export const word = style({
  fontSize: fontSize.rem90,
  color: vars.color.textPrimary,
  wordBreak: 'break-all',
});

export const removeBtn = style({
  padding: '4px 12px',
  borderRadius: vars.radius.sm,
  border: 'none',
  backgroundColor: vars.color.bgTertiary,
  color: vars.color.textPrimary,
  fontSize: fontSize.rem82,
  cursor: 'pointer',
  flexShrink: 0,
  ':hover': { backgroundColor: vars.color.bgHover },
});
