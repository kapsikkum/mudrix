import { style } from '@vanilla-extract/css';
import { vars } from '@/theme/vars.css';
import { fast } from '@/theme/animations.css';
import { fontSize } from '@/theme/typeScale';

export const menu = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '2px',
  minWidth: '248px',
});

export const row = style({
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
  width: '100%',
  padding: '8px 10px',
  border: 'none',
  borderRadius: vars.radius.sm,
  backgroundColor: 'transparent',
  color: vars.color.textPrimary,
  fontSize: fontSize.rem88,
  textAlign: 'left',
  cursor: 'pointer',
  transition: `background-color ${fast}`,
  selectors: {
    '&:hover': { backgroundColor: vars.color.bgHover },
    '&:focus-visible': { outline: `2px solid ${vars.color.accent}`, outlineOffset: '-2px' },
    '&:disabled': { opacity: 0.5, cursor: 'not-allowed' },
  },
});

export const rowIcon = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '14px',
  flexShrink: 0,
  color: vars.color.textMuted,
});

export const rowLabel = style({
  flex: 1,
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});

export const rowCheck = style({
  display: 'flex',
  alignItems: 'center',
  color: vars.color.accent,
  flexShrink: 0,
});

export const dot = style({
  width: '10px',
  height: '10px',
  borderRadius: '50%',
  flexShrink: 0,
});

export const dotAuto = style([
  dot,
  {
    boxSizing: 'border-box',
    border: '2px solid currentColor',
    color: vars.color.textMuted,
  },
]);

export const divider = style({
  height: '1px',
  margin: '4px 0',
  backgroundColor: vars.color.border,
});

export const note = style({
  margin: '4px 10px 2px',
  fontSize: fontSize.rem75,
  color: vars.color.textMuted,
  lineHeight: 1.4,
});

export const header = style({
  display: 'flex',
  alignItems: 'center',
  gap: '12px',
  padding: '8px 10px',
});

export const headerAvatar = style({
  display: 'inline-flex',
  flexShrink: 0,
  padding: 0,
  border: 'none',
  borderRadius: '50%',
  backgroundColor: 'transparent',
  cursor: 'pointer',
  selectors: {
    '&:focus-visible': { outline: `2px solid ${vars.color.accent}`, outlineOffset: '2px' },
  },
});

export const headerText = style({
  display: 'flex',
  flexDirection: 'column',
  minWidth: 0,
  gap: '2px',
});

export const headerName = style({
  fontSize: fontSize.rem95,
  fontWeight: 600,
  color: vars.color.textPrimary,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});

export const headerStatus = style({
  fontSize: fontSize.rem78,
  color: vars.color.textMuted,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});
