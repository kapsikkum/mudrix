import { style, keyframes, globalStyle } from '@vanilla-extract/css';
import { vars } from '@/theme/vars.css';

const placeholderPulse = keyframes({
  '0%': { opacity: 0.55 },
  '50%': { opacity: 1 },
  '100%': { opacity: 0.55 },
});

export const placeholderBox = style({
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  aspectRatio: '1 / 1',
  verticalAlign: 'middle',
  flexShrink: 0,
  borderRadius: vars.radius.sm,
  backgroundColor: vars.color.border,
  color: vars.color.textMuted,
  animation: `${placeholderPulse} 1.5s ease-in-out infinite`,
});

globalStyle(`${placeholderBox} svg`, {
  width: '62%',
  height: '62%',
});
