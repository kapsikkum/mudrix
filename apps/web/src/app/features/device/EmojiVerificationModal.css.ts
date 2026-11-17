import { style } from '@vanilla-extract/css';
import { vars } from '@/theme/vars.css';
import { fontSize } from '@/theme/typeScale';

export const emojiGrid = style({
  display: 'flex',
  flexWrap: 'wrap',
  gap: '12px',
  justifyContent: 'center',
  padding: '8px 0',
});

export const emojiItem = style({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: '4px',
  width: '64px',
});

export const emojiChar = style({
  fontSize: fontSize.xxl,
  lineHeight: '1',
});

export const emojiName = style({
  fontSize: fontSize.xs,
  color: vars.color.textMuted,
  textAlign: 'center',
  textTransform: 'capitalize',
});

export const instructions = style({
  fontSize: fontSize.sm,
  color: vars.color.textMuted,
  lineHeight: '1.55',
  textAlign: 'center',
});

export const waitingMsg = style({
  fontSize: fontSize.sm,
  color: vars.color.textMuted,
  textAlign: 'center',
  padding: '24px 0',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: '12px',
});

export const doneMsg = style({
  fontSize: fontSize.md,
  textAlign: 'center',
  padding: '16px 0',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: '12px',
});

export const doneMsgTitle = style({
  color: vars.color.textPrimary,
  fontWeight: 600,
});

export const doneMsgSubtitle = style({
  color: vars.color.textMuted,
  fontSize: fontSize.sm,
});

export const iconBefore = style({
  marginRight: '6px',
});
