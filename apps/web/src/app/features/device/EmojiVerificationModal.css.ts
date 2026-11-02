import { style } from '@vanilla-extract/css';
import { vars } from '@/theme/vars.css';

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
  fontSize: '2rem',
  lineHeight: '1',
});

export const emojiName = style({
  fontSize: '0.7rem',
  color: vars.color.textMuted,
  textAlign: 'center',
  textTransform: 'capitalize',
});

export const instructions = style({
  fontSize: '0.88rem',
  color: vars.color.textMuted,
  lineHeight: '1.55',
  textAlign: 'center',
});

export const waitingMsg = style({
  fontSize: '0.9rem',
  color: vars.color.textMuted,
  textAlign: 'center',
  padding: '24px 0',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: '12px',
});

export const doneMsg = style({
  fontSize: '0.95rem',
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
  fontSize: '0.85rem',
});

export const iconBefore = style({
  marginRight: '6px',
});
