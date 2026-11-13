import { style } from '@vanilla-extract/css';
import { vars } from '@/theme/vars.css';
import { fast } from '@/theme/animations.css';
import { fontSize } from '@/theme/typeScale';

export const list = style({
  display: 'flex',
  flexDirection: 'column',
});

export const item = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '2px',
  padding: '10px 16px',
  textAlign: 'left',
  background: 'none',
  border: 'none',
  borderBottom: `1px solid ${vars.color.border}`,
  cursor: 'pointer',
  color: vars.color.textPrimary,
  font: 'inherit',
  transition: `background-color ${fast}`,
  selectors: {
    '&:hover': {
      backgroundColor: vars.color.bgHover,
    },
  },
});

export const itemMeta = style({
  display: 'flex',
  alignItems: 'baseline',
  gap: '8px',
  minWidth: 0,
});

export const itemSender = style({
  fontSize: fontSize.rem85,
  fontWeight: 600,
  color: vars.color.accent,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});

export const itemRoom = style({
  fontSize: fontSize.rem75,
  color: vars.color.textMuted,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});

export const itemTime = style({
  marginLeft: 'auto',
  flexShrink: 0,
  fontSize: fontSize.rem75,
  color: vars.color.textMuted,
});

export const itemBody = style({
  fontSize: fontSize.rem92,
  color: vars.color.textPrimary,
  overflow: 'hidden',
  display: '-webkit-box',
  WebkitLineClamp: 3,
  WebkitBoxOrient: 'vertical',
  wordBreak: 'break-word',
  whiteSpace: 'pre-wrap',
});

export const highlight = style({
  backgroundColor: `rgba(${vars.color.accentRgb}, 0.35)`,
  color: 'inherit',
  borderRadius: '2px',
  padding: '0 1px',
});

export const status = style({
  padding: '24px 16px',
  textAlign: 'center',
  color: vars.color.textMuted,
  fontSize: fontSize.rem90,
});

export const statusError = style({
  color: vars.color.danger,
});

export const loadMore = style({
  margin: '12px auto',
  padding: '6px 14px',
  borderRadius: '6px',
  border: `1px solid ${vars.color.border}`,
  backgroundColor: 'transparent',
  color: vars.color.textPrimary,
  cursor: 'pointer',
  font: 'inherit',
  fontSize: fontSize.rem85,
  selectors: {
    '&:hover': {
      backgroundColor: vars.color.bgHover,
    },
    '&:disabled': {
      opacity: 0.6,
      cursor: 'default',
    },
  },
});

export const encryptedNote = style({
  padding: '6px 16px',
  fontSize: fontSize.rem80,
  backgroundColor: vars.color.bgAccentGlow1,
  color: vars.color.textSecondary,
  borderBottom: `1px solid ${vars.color.border}`,
  flexShrink: 0,
});
