import { style } from '@vanilla-extract/css';
import { vars } from '@/theme/vars.css';
import { fast } from '@/theme/animations.css';

export const card = style({
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  width: '320px',
  maxWidth: '320px',
  padding: '8px 10px',
  borderRadius: vars.radius.md,
  border: `1px solid ${vars.color.border}`,
  backgroundColor: vars.color.bgSecondary,
});

export const playBtn = style({
  width: '36px',
  height: '36px',
  borderRadius: vars.radius.sm,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  border: 'none',
  cursor: 'pointer',
  flexShrink: 0,
  backgroundColor: vars.color.bgTertiary,
  color: vars.color.accent,
  transition: `background-color ${fast}, color ${fast}`,
  ':hover': { backgroundColor: vars.color.bgHover, color: vars.color.accent },
});

export const body = style({
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'center',
  gap: '6px',
  flex: 1,
  minWidth: 0,
});

export const titleRow = style({
  display: 'flex',
  alignItems: 'baseline',
  gap: '8px',
  minWidth: 0,
});

export const name = style({
  flex: 1,
  minWidth: 0,
  fontSize: '0.9rem',
  fontWeight: 500,
  color: vars.color.textPrimary,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});

export const size = style({
  flexShrink: 0,
  fontSize: '0.78rem',
  color: vars.color.textMuted,
  whiteSpace: 'nowrap',
});

export const timelineRow = style({
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
});

export const timeline = style({
  flex: 1,
  height: '4px',
  borderRadius: '2px',
  backgroundColor: vars.color.bgTertiary,
  cursor: 'pointer',
  overflow: 'hidden',
});

export const timelineFill = style({
  height: '100%',
  borderRadius: '2px',
  backgroundColor: vars.color.accent,
  transition: `width ${fast} linear`,
});

export const time = style({
  flexShrink: 0,
  fontSize: '0.72rem',
  color: vars.color.textMuted,
  fontVariantNumeric: 'tabular-nums',
  minWidth: '34px',
  textAlign: 'right',
});
