import { style, keyframes } from '@vanilla-extract/css';
import { vars } from '@/theme/vars.css';
import { fast } from '@/theme/animations.css';

const spin = keyframes({
  from: { transform: 'rotate(0deg)' },
  to: { transform: 'rotate(360deg)' },
});

export const resultsPanel = style({
  display: 'flex',
  flexDirection: 'column',
  borderRadius: vars.radius.md,
  border: `1px solid ${vars.color.border}`,
  overflow: 'hidden',
  backgroundColor: vars.color.bgSecondary,
});

export const sectionHeader = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '6px 12px',
  fontSize: '0.72rem',
  fontWeight: 700,
  letterSpacing: '0.06em',
  color: vars.color.textMuted,
  backgroundColor: vars.color.bgTertiary,
  borderBottom: `1px solid ${vars.color.border}`,
});

export const spinner = style({
  width: '10px',
  height: '10px',
  borderRadius: '50%',
  border: `2px solid ${vars.color.border}`,
  borderTopColor: vars.color.textMuted,
  animationName: spin,
  animationDuration: '0.7s',
  animationTimingFunction: 'linear',
  animationIterationCount: 'infinite',
});

export const item = style({
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
  padding: '8px 12px',
  cursor: 'pointer',
  transition: `background-color ${fast}`,
  borderBottom: `1px solid ${vars.color.border}`,
  selectors: {
    '&:last-child': {
      borderBottom: 'none',
    },
    '&:hover': {
      backgroundColor: vars.color.bgHover,
    },
  },
});

export const itemSelected = style([
  item,
  {
    backgroundColor: vars.color.bgActive,
  },
]);

export const itemInfo = style({
  flex: 1,
  minWidth: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: '1px',
});

export const displayName = style({
  fontSize: '0.88rem',
  fontWeight: 500,
  color: vars.color.textPrimary,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});

export const userId = style({
  fontSize: '0.76rem',
  color: vars.color.textMuted,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});

export const emptyRow = style({
  padding: '10px 12px',
  fontSize: '0.84rem',
  color: vars.color.textMuted,
  fontStyle: 'italic',
});

export const selectHint = style({
  padding: '5px 12px',
  fontSize: '0.74rem',
  color: vars.color.textMuted,
  backgroundColor: vars.color.bgTertiary,
  borderTop: `1px solid ${vars.color.border}`,
});
