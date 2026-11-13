import { keyframes, style } from '@vanilla-extract/css';
import { vars } from '@/theme/vars.css';

export const rows = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '6px',
  margin: '8px 0 12px',
});

export const row = style({
  display: 'flex',
  alignItems: 'baseline',
  justifyContent: 'space-between',
  gap: '12px',
  fontSize: '0.85rem',
});

export const label = style({
  margin: 0,
  color: vars.color.textMuted,
});

export const value = style({
  margin: 0,
  color: vars.color.textPrimary,
  selectors: {
    '&[data-tone="ok"]': { color: vars.color.success },
    '&[data-tone="warn"]': { color: vars.color.warning },
    '&[data-tone="off"]': { color: vars.color.textMuted },
  },
});

export const actions = style({
  display: 'flex',
  alignItems: 'center',
  flexWrap: 'wrap',
  gap: '8px',
});

export const error = style({
  fontSize: '0.8rem',
  color: vars.color.danger,
  margin: '0 0 8px',
});

export const progressWrap = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '6px',
  margin: '0 0 12px',
});

export const progressTrack = style({
  height: '6px',
  borderRadius: '3px',
  overflow: 'hidden',
  backgroundColor: vars.color.bgTertiary,
});

const slide = keyframes({
  '0%': { transform: 'translateX(-100%)' },
  '100%': { transform: 'translateX(250%)' },
});

export const progressBar = style({
  height: '100%',
  borderRadius: '3px',
  backgroundColor: vars.color.accent,
  transition: 'width 0.2s ease',
  selectors: {
    '&[data-indeterminate]': {
      width: '40%',
      animation: `${slide} 1.2s ease-in-out infinite`,
    },
  },
  '@media': {
    '(prefers-reduced-motion: reduce)': {
      selectors: {
        '&[data-indeterminate]': { animation: 'none', width: '100%', opacity: 0.5 },
      },
    },
  },
});
