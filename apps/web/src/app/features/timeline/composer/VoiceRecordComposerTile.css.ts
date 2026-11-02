import { style, keyframes } from '@vanilla-extract/css';
import { vars } from '@/theme/vars.css';
import { fast } from '@/theme/animations.css';

const blink = keyframes({
  '0%, 100%': { opacity: 1 },
  '50%': { opacity: 0.25 },
});

export const tile = style({
  flexShrink: 0,
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  padding: '2px 4px',
  minHeight: '32px',
});

export const recordDot = style({
  flexShrink: 0,
  width: '10px',
  height: '10px',
  borderRadius: '50%',
  backgroundColor: vars.color.danger,
  animation: `${blink} 1.2s ease-in-out infinite`,
});

export const recordDotPaused = style({
  animation: 'none',
  opacity: 0.5,
});

export const timer = style({
  flexShrink: 0,
  fontVariantNumeric: 'tabular-nums',
  fontSize: '0.85rem',
  color: vars.color.textMuted,
  minWidth: '42px',
});

export const timerWarn = style({
  color: vars.color.danger,
});

export const waveform = style({
  width: '96px',
  flexShrink: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'flex-start',
  gap: '2px',
  height: '26px',
  overflow: 'hidden',
});

export const bar = style({
  width: '3px',
  flexShrink: 0,
  minHeight: '2px',
  borderRadius: '2px',
  backgroundColor: vars.color.accent,
  transition: `height ${fast} ease`,
});

export const hiddenAudio = style({
  display: 'none',
});

export const controls = style({
  flexShrink: 0,
  display: 'flex',
  alignItems: 'center',
  gap: '4px',
});

const btnBase = style({
  width: '30px',
  height: '30px',
  borderRadius: '50%',
  border: 'none',
  background: 'none',
  color: vars.color.textMuted,
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
  transition: `background-color ${fast}, color ${fast}`,
  ':disabled': { opacity: 0.4, cursor: 'not-allowed' },
});

export const iconBtn = style([
  btnBase,
  {
    ':hover': { backgroundColor: vars.color.bgHover, color: vars.color.textPrimary },
  },
]);

export const dangerBtn = style([
  btnBase,
  {
    ':hover': { backgroundColor: vars.color.bgHover, color: vars.color.danger },
  },
]);

export const accentBtn = style([
  btnBase,
  {
    width: '32px',
    height: '32px',
    backgroundColor: vars.color.accent,
    color: '#fff',
    ':hover': { backgroundColor: vars.color.accentHover },
  },
]);

export const statusRow = style({
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
  maxWidth: '200px',
  fontSize: '0.85rem',
  color: vars.color.textMuted,
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
});

export const errorText = style({
  maxWidth: '220px',
  fontSize: '0.85rem',
  color: vars.color.danger,
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
});
