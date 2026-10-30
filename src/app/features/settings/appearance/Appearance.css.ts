import { style } from '@vanilla-extract/css';
import { vars } from '@/theme/vars.css';
import { chatSize } from '@/app/features/timeline/chatDisplay';
import { fast } from '@/theme/animations.css';

export const preview = style({
  backgroundColor: vars.color.bgSecondary,
  border: `1px solid ${vars.color.border}`,
  borderRadius: vars.radius.md,
  padding: '10px 0',
  marginBottom: '8px',
  userSelect: 'none',
});

export const previewSender = style({
  fontWeight: 600,
  color: vars.color.textPrimary,
  fontSize: chatSize(0.95),
  lineHeight: 1.15,
});

export const swatchRow = style({
  display: 'flex',
  gap: '10px',
  flexWrap: 'wrap',
});

export const swatch = style({
  position: 'relative',
  width: '32px',
  height: '32px',
  borderRadius: '10px',
  border: 'none',
  padding: 0,
  cursor: 'pointer',
  backgroundClip: 'padding-box',
  boxShadow: 'inset 0 0 0 1px rgba(128, 128, 128, 0.28)',
  outline: '2px solid transparent',
  outlineOffset: '3px',
  transition: `outline-color ${fast}, transform ${fast}`,
  ':hover': { transform: 'scale(1.06)' },
  ':focus-visible': { outlineColor: vars.color.accent },
});

export const swatchActive = style([swatch, { outlineColor: vars.color.accent }]);
