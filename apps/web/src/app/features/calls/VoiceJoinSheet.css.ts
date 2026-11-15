import { style } from '@vanilla-extract/css';
import { vars } from '@/theme/vars.css';
import { fontSize } from '@/theme/typeScale';

export const sheet = style({
  gap: '8px',
  padding: '4px 16px 16px',
});

export const title = style({
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  color: vars.color.textPrimary,
  fontSize: fontSize.md,
  fontWeight: 600,
});

export const roomName = style({
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});

export const sectionLabel = style({
  color: vars.color.textMuted,
  fontSize: fontSize.xs,
  fontWeight: 600,
});

export const list = style({
  listStyle: 'none',
  margin: 0,
  padding: 0,
  display: 'flex',
  flexDirection: 'column',
  maxHeight: '30dvh',
  overflowY: 'auto',
  overscrollBehavior: 'contain',
});

export const row = style({
  display: 'flex',
  alignItems: 'center',
  gap: '12px',
  minHeight: '48px',
});

export const name = style({
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  color: vars.color.textPrimary,
});

const button = style({
  minHeight: '48px',
  border: 'none',
  borderRadius: vars.radius.md,
  fontSize: fontSize.md,
  fontWeight: 600,
  cursor: 'pointer',
});

export const joinBtn = style([
  button,
  {
    backgroundColor: vars.color.accent,
    color: '#fff',
    marginTop: '4px',
    ':hover': { backgroundColor: vars.color.accentHover },
  },
]);

export const cancelBtn = style([
  button,
  {
    backgroundColor: 'transparent',
    color: vars.color.textMuted,
  },
]);
