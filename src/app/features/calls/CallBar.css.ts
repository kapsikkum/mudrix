import { style } from '@vanilla-extract/css';
import { vars } from '@/theme/vars.css';
import { fast } from '@/theme/animations.css';

export const bar = style({
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  padding: '10px 14px',
  borderBottom: `1px solid ${vars.color.border}`,
  flexShrink: 0,
});

export const statusRow = style({
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
  color: vars.color.success,
  flexShrink: 0,
});

export const statusRowConnecting = style([
  statusRow,
  {
    color: vars.color.warning,
  },
]);

export const info = style({
  flex: 1,
  minWidth: 0,
});

export const callStatus = style({
  fontSize: '0.72rem',
  fontWeight: 600,
  letterSpacing: '0.02em',
  textTransform: 'uppercase',
  color: 'inherit',
});

export const callerName = style({
  fontSize: '0.82rem',
  fontWeight: 500,
  color: vars.color.textMuted,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  padding: 0,
  border: 'none',
  backgroundColor: 'transparent',
  textAlign: 'left',
  maxWidth: '100%',
  display: 'block',
  cursor: 'pointer',
  selectors: {
    '&:hover': {
      textDecoration: 'underline',
    },
    '&:focus-visible': { outline: `2px solid ${vars.color.accent}`, outlineOffset: 1 },
  },
});

export const controls = style({
  display: 'flex',
  alignItems: 'center',
  gap: '4px',
  flexShrink: 0,
});

export const ctrl = style({
  width: '28px',
  height: '28px',
  borderRadius: vars.radius.sm,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
  border: 'none',
  color: vars.color.textMuted,
  fontSize: '0.85rem',
  backgroundColor: 'transparent',
  transition: `background-color ${fast}, color ${fast}`,
  ':hover': { backgroundColor: vars.color.bgHover, color: vars.color.textPrimary },
});

export const ctrlActive = style([
  ctrl,
  {
    color: vars.color.success,
    ':hover': { backgroundColor: vars.color.bgHover, color: vars.color.success },
  },
]);

export const leaveBtn = style([
  ctrl,
  {
    color: vars.color.danger,
    ':hover': { backgroundColor: vars.color.bgHover, color: vars.color.danger },
  },
]);
