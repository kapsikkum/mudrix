import { style } from '@vanilla-extract/css';
import { vars } from '@/theme/vars.css';

export const sheet = style({
  gap: '8px',
  padding: '4px 16px 16px',
});

export const title = style({
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  color: vars.color.textPrimary,
  fontSize: '1.1rem',
  fontWeight: 700,
});

export const roomName = style({
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});

export const sectionLabel = style({
  color: vars.color.textMuted,
  fontSize: '0.8rem',
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
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
  fontSize: '1rem',
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
