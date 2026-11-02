import { style } from '@vanilla-extract/css';
import { vars } from '@/theme/vars.css';
import { fast } from '@/theme/animations.css';

export const player = style({
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

export const waveformWrap = style({
  flex: 1,
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  alignSelf: 'stretch',
});

export const waveformLoading = style({
  width: '100%',
  height: '32px',
  borderRadius: vars.radius.sm,
  backgroundColor: vars.color.bgTertiary,
});

export const time = style({
  fontSize: '0.78rem',
  color: vars.color.textMuted,
  fontVariantNumeric: 'tabular-nums',
  flexShrink: 0,
  minWidth: '34px',
  textAlign: 'right',
});
