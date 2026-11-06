import { style } from '@vanilla-extract/css';
import { vars } from '@/theme/vars.css';
import { fast } from '@/theme/animations.css';

export const bar = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '8px',
  padding: '10px 14px',
  borderBottom: `1px solid ${vars.color.border}`,
  flexShrink: 0,
});

export const header = style({
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
});

export const actions = style({
  display: 'flex',
  gap: '6px',
});

export const actionSlot = style({
  display: 'flex',
  flex: 1,
  minWidth: 0,
});

export const actionBtn = style({
  flex: 1,
  minWidth: 0,
  height: '32px',
  borderRadius: vars.radius.sm,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
  border: 'none',
  color: vars.color.textMuted,
  backgroundColor: vars.color.bgHover,
  transition: `filter ${fast}, color ${fast}`,
  selectors: {
    '&:hover:not(:disabled)': { filter: 'brightness(1.25)', color: vars.color.textPrimary },
    '&:disabled': { opacity: 0.5, cursor: 'default' },
    '&:focus-visible': { outline: `2px solid ${vars.color.accent}`, outlineOffset: 1 },
  },
});

export const actionBtnActive = style([actionBtn, { color: vars.color.success }]);

export const statusRow = style({
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
  color: vars.color.success,
  flexShrink: 0,
  padding: 0,
  border: 0,
  background: 'none',
  font: 'inherit',
  cursor: 'pointer',
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
  selectors: {
    [`${statusRow}:hover &`]: { textDecoration: 'underline' },
  },
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

export const stats = style({
  width: '280px',
  padding: '12px',
  display: 'flex',
  flexDirection: 'column',
  gap: '6px',
});

export const statsTitle = style({
  fontSize: '0.72rem',
  fontWeight: 700,
  letterSpacing: '0.02em',
  textTransform: 'uppercase',
  color: vars.color.textMuted,
});

export const statsGraph = style({
  display: 'block',
  width: '100%',
  height: '48px',
  borderRadius: vars.radius.sm,
  background: vars.color.bgTertiary,
});

export const statsGraphLine = style({
  fill: 'none',
  stroke: vars.color.success,
  strokeWidth: 2,
  strokeLinejoin: 'round',
});

export const statsPings = style({
  display: 'flex',
  justifyContent: 'space-between',
  fontSize: '0.75rem',
  color: vars.color.textMuted,
  marginBottom: '4px',
});

export const statsRow = style({
  display: 'flex',
  justifyContent: 'space-between',
  gap: '12px',
  fontSize: '0.78rem',
});

export const statsLabel = style({
  color: vars.color.textMuted,
  flexShrink: 0,
});

export const statsValue = style({
  color: vars.color.textPrimary,
  textAlign: 'right',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  fontVariantNumeric: 'tabular-nums',
});

export const statsNote = style({
  margin: 0,
  fontSize: '0.78rem',
  color: vars.color.textMuted,
});

export const ctrlMuted = style([
  ctrl,
  {
    color: vars.color.danger,
    ':hover': { backgroundColor: vars.color.bgHover, color: vars.color.danger },
  },
]);
