import { style } from '@vanilla-extract/css';
import { vars } from '@/theme/vars.css';

export const shield = style({
  display: 'inline-flex',
  alignItems: 'center',
  flexShrink: 0,
  verticalAlign: 'middle',
  color: vars.color.textMuted,
  cursor: 'help',
  opacity: 0.85,
  selectors: {
    '&:hover': { opacity: 1 },
  },
});

export const shieldGrey = style({ color: vars.color.textMuted });
export const shieldWarning = style({ color: vars.color.warning });
export const shieldRed = style({ color: vars.color.danger });
