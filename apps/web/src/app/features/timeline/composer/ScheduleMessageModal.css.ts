import { style } from '@vanilla-extract/css';
import { vars } from '@/theme/vars.css';
import { fast } from '@/theme/animations.css';
import { fontSize } from '@/theme/typeScale';

export const notice = style({
  margin: 0,
  padding: '10px 12px',
  borderRadius: vars.radius.md,
  border: `1px solid ${vars.color.border}`,
  backgroundColor: vars.color.bgTertiary,
  color: vars.color.textMuted,
  fontSize: fontSize.rem85,
  lineHeight: 1.5,
});

export const preview = style({
  padding: '8px 12px',
  borderRadius: vars.radius.md,
  border: `1px solid ${vars.color.border}`,
  backgroundColor: vars.color.bgInput,
  color: vars.color.textPrimary,
  fontSize: fontSize.rem90,
  maxHeight: '96px',
  overflowY: 'auto',
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
});

export const whenRow = style({
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  gap: '8px',
});

export const dateInput = style({
  flex: '1 1 200px',
  minWidth: 0,
  padding: '8px 12px',
  backgroundColor: vars.color.bgInput,
  border: `1px solid ${vars.color.border}`,
  borderRadius: vars.radius.md,
  color: vars.color.textPrimary,
  fontSize: fontSize.rem95,
  fontFamily: 'inherit',
  outline: 'none',
  colorScheme: 'light dark',
  ':focus': { borderColor: vars.color.accent },
  ':disabled': { opacity: 0.5 },
});

export const presetBtn = style({
  padding: '7px 12px',
  borderRadius: vars.radius.md,
  border: `1px solid ${vars.color.border}`,
  background: 'none',
  color: vars.color.textMuted,
  fontSize: fontSize.rem82,
  cursor: 'pointer',
  transition: `border-color ${fast}, color ${fast}`,
  ':hover': { borderColor: vars.color.accent, color: vars.color.accent },
  ':disabled': { opacity: 0.4, cursor: 'not-allowed' },
});

export const empty = style({
  margin: 0,
  color: vars.color.textMuted,
  fontSize: fontSize.rem85,
});

export const list = style({
  listStyle: 'none',
  margin: 0,
  padding: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: '8px',
});

export const item = style({
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  padding: '8px 12px',
  borderRadius: vars.radius.md,
  border: `1px solid ${vars.color.border}`,
  backgroundColor: vars.color.bgSecondary,
});

export const itemInfo = style({
  flex: 1,
  minWidth: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: '2px',
});

export const itemWhen = style({
  fontSize: fontSize.rem78,
  color: vars.color.textMuted,
});

export const itemBody = style({
  fontSize: fontSize.rem90,
  color: vars.color.textPrimary,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});

const itemBtnBase = style({
  display: 'inline-flex',
  alignItems: 'center',
  gap: '4px',
  flexShrink: 0,
  padding: '5px 10px',
  borderRadius: vars.radius.sm,
  border: 'none',
  background: 'none',
  color: vars.color.textMuted,
  fontSize: fontSize.rem80,
  cursor: 'pointer',
  ':hover': { backgroundColor: vars.color.bgHover, color: vars.color.textPrimary },
  ':disabled': { opacity: 0.45, cursor: 'not-allowed' },
});

export const itemBtn = itemBtnBase;

export const itemBtnDanger = style([
  itemBtnBase,
  { ':hover': { backgroundColor: vars.color.bgHover, color: vars.color.danger } },
]);
