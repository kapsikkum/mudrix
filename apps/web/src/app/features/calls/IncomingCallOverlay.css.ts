import { keyframes, style } from '@vanilla-extract/css';
import { vars } from '@/theme/vars.css';
import { fast } from '@/theme/animations.css';

const slideIn = keyframes({
  from: { opacity: 0, transform: 'translateY(8px)' },
  to: { opacity: 1, transform: 'translateY(0)' },
});

const ring = keyframes({
  '0%': { boxShadow: `0 0 0 0 rgba(${vars.color.accentRgb}, 0.5)` },
  '70%': { boxShadow: `0 0 0 8px rgba(${vars.color.accentRgb}, 0)` },
  '100%': { boxShadow: `0 0 0 0 rgba(${vars.color.accentRgb}, 0)` },
});

export const overlay = style({
  position: 'fixed',
  bottom: '20px',
  right: '20px',
  zIndex: 8500,
  width: '300px',
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
  padding: '12px',
  backgroundColor: vars.color.bgSecondary,
  border: `1px solid ${vars.color.border}`,
  borderRadius: vars.radius.md,
  boxShadow: '0 8px 28px rgba(0,0,0,0.35)',
  animation: `${slideIn} 180ms ease-out`,
});

export const avatarRing = style({
  display: 'inline-flex',
  flexShrink: 0,
  borderRadius: '50%',
  animation: `${ring} 1.6s ease-out infinite`,
});

export const callerInfo = style({
  flex: 1,
  minWidth: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: '2px',
});

export const callerName = style({
  fontSize: '0.92rem',
  fontWeight: 600,
  color: vars.color.textPrimary,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});

export const callKind = style({
  display: 'flex',
  alignItems: 'center',
  gap: '4px',
  minWidth: 0,
  fontSize: '0.78rem',
  color: vars.color.textMuted,
  whiteSpace: 'nowrap',
});

export const ellipsis = style({
  overflow: 'hidden',
  textOverflow: 'ellipsis',
});

export const roomName = style({
  fontSize: '0.78rem',
  color: vars.color.textMuted,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});

const roundBtn = style({
  flexShrink: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '36px',
  height: '36px',
  borderRadius: '50%',
  border: 'none',
  cursor: 'pointer',
  transition: `background-color ${fast}`,
});

export const declineBtn = style([
  roundBtn,
  {
    backgroundColor: vars.color.bgTertiary,
    color: vars.color.textPrimary,
    ':hover': { backgroundColor: vars.color.bgHover },
  },
]);

export const acceptBtn = style([
  roundBtn,
  {
    backgroundColor: vars.color.accent,
    color: '#fff',
    ':hover': { backgroundColor: vars.color.accentHover },
  },
]);
