import { style } from '@vanilla-extract/css';
import { vars } from '@/theme/vars.css';
import { scaleIn, fast } from '@/theme/animations.css';

export const overlay = style({
  position: 'fixed',
  inset: 0,
  zIndex: 7500,
});

export const popup = style({
  position: 'fixed',
  zIndex: 7501,
  width: '280px',
  backgroundColor: vars.color.bgSecondary,
  border: `1px solid ${vars.color.border}`,
  borderRadius: vars.radius.md,
  boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
  animation: `${scaleIn} ${fast} ease`,
  display: 'flex',
  flexDirection: 'column',
  padding: '20px',
  gap: '14px',
  maxHeight: 'calc(100vh - 32px)',
  overflowY: 'auto',
  overflowX: 'hidden',
});

export const coverWrap = style({
  margin: '-20px -20px 0',
  position: 'relative',
  height: '100px',
  flexShrink: 0,
});

export const cover = style({
  position: 'absolute',
  inset: 0,
  width: '100%',
  height: '100%',
  objectFit: 'cover',
  display: 'block',
  pointerEvents: 'none',
});

export const coverFallback = style({
  position: 'absolute',
  inset: 0,
  pointerEvents: 'none',
});

export const coverNeutral = style({
  position: 'absolute',
  inset: 0,
  pointerEvents: 'none',
  backgroundColor: vars.color.bgTertiary,
});

export const coverEdit = style({
  position: 'absolute',
  top: '8px',
  right: '8px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '28px',
  height: '28px',
  borderRadius: '50%',
  backgroundColor: 'rgba(0,0,0,0.4)',
  color: 'rgba(255,255,255,0.9)',
  opacity: 0,
  transition: 'opacity 0.15s ease',
  pointerEvents: 'none',
  selectors: {
    [`${coverWrap}:hover &`]: {
      opacity: 1,
    },
  },
});

export const topRow = style({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'flex-start',
  gap: '4px',
  marginTop: '-30px',
  position: 'relative',
  zIndex: 1,
});

export const avatarRow = style({
  display: 'flex',
  flexDirection: 'row',
  alignItems: 'center',
  gap: '4px',
  width: '100%',
});

export const avatarWrap = style({
  cursor: 'pointer',
  borderRadius: '50%',
  lineHeight: 0,
  flexShrink: 0,
  backgroundColor: vars.color.bgSecondary,
  padding: '3px',
});

export const nameSection = style({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'flex-start',
  gap: '2px',
  minWidth: 0,
  maxWidth: '100%',
});

export const displayName = style({
  fontSize: '1.05rem',
  fontWeight: 700,
  color: vars.color.textPrimary,
  wordBreak: 'break-word',
  lineHeight: 1.3,
});

export const displayNameRow = style({
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
  minWidth: 0,
});

export const verifiedBadge = style({
  flexShrink: 0,
  color: vars.color.accent,
});

export const userIdRow = style({
  display: 'flex',
  alignItems: 'center',
  gap: '4px',
});

export const userId = style({
  fontSize: '0.8rem',
  color: vars.color.textMuted,
  fontFamily: 'monospace',
  wordBreak: 'break-all',
  lineHeight: 1.3,
});

export const infoRow = style({
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  fontSize: '0.85rem',
});

export const infoIcon = style({
  display: 'flex',
  alignItems: 'center',
  color: vars.color.textMuted,
  flexShrink: 0,
});

export const infoValue = style({
  color: vars.color.textPrimary,
  fontWeight: 500,
  marginRight: 'auto',
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});

export const roleBadge = style({
  fontSize: '0.75rem',
  fontWeight: 600,
  padding: '2px 8px 2px 6px',
  borderRadius: vars.radius.sm,
  textTransform: 'capitalize',
  flexShrink: 0,
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px',
  backgroundColor: vars.color.bgTertiary,
  border: `1px solid ${vars.color.border}`,
  color: vars.color.textPrimary,
});

export const roleDot = style({
  width: '12px',
  height: '12px',
  borderRadius: '50%',
  flexShrink: 0,
});

export const roleAdminDot = style([roleDot, { backgroundColor: '#ef4444' }]);
export const roleModeratorDot = style([roleDot, { backgroundColor: '#eab308' }]);
export const roleMemberDot = style([roleDot, { backgroundColor: '#3b82f6' }]);
export const roleFounderDot = style([roleDot, { backgroundColor: '#a855f7' }]);

export const roleAdmin = style([roleBadge]);
export const roleModerator = style([roleBadge]);
export const roleMember = style([roleBadge]);
export const roleFounder = style([roleBadge]);

export const modActions = style({
  display: 'flex',
  gap: '8px',
});

export const modActionBtn = style({
  flex: 1,
});

export const primaryRow = style({
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
});

export const primaryBtn = style({
  flex: 1,
});

export const hiddenInput = style({
  position: 'absolute',
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap',
  border: 0,
});

export const avatarWrapEditable = style({
  position: 'relative',
});

export const avatarEdit = style({
  position: 'absolute',
  inset: '4px',
  borderRadius: '50%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  backgroundColor: 'rgba(0,0,0,0.4)',
  color: 'rgba(255,255,255,0.9)',
  opacity: 0,
  transition: 'opacity 0.15s ease',
  pointerEvents: 'none',
  selectors: {
    [`${avatarWrapEditable}:hover &`]: { opacity: 1 },
  },
});

export const accountsSection = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '8px',
});

export const accountsDivider = style({
  height: '1px',
  backgroundColor: vars.color.border,
  margin: '2px 0',
});

export const switchRow = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '8px',
  width: '100%',
  padding: '8px',
  borderRadius: vars.radius.sm,
  border: '1px solid transparent',
  backgroundColor: 'transparent',
  color: vars.color.textPrimary,
  fontSize: '0.9rem',
  fontWeight: 500,
  textAlign: 'left',
  cursor: 'pointer',
  selectors: {
    '&:hover': {
      backgroundColor: vars.color.bgTertiary,
    },
  },
});

export const accountsFlyout = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '4px',
  minWidth: '240px',
});

export const accountRow = style({
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
  padding: '6px 8px',
  borderRadius: vars.radius.sm,
  cursor: 'pointer',
  border: '1px solid transparent',
  selectors: {
    '&:hover': {
      backgroundColor: vars.color.bgTertiary,
    },
  },
});

export const accountRowActive = style({
  border: `1px solid ${vars.color.success}`,
  backgroundColor: vars.color.bgTertiary,
  cursor: 'default',
});

export const accountMeta = style({
  display: 'flex',
  flexDirection: 'column',
  minWidth: 0,
  flex: 1,
});

export const accountName = style({
  fontSize: '0.85rem',
  fontWeight: 500,
  color: vars.color.textPrimary,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});

export const accountServer = style({
  fontSize: '0.75rem',
  color: vars.color.textMuted,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});

export const statusSlot = style({
  flex: 1,
  minWidth: 0,
  display: 'flex',
  alignSelf: 'flex-end',
  marginBottom: '6px',
  paddingLeft: '2px',
  paddingRight: '4px',
});

export const status = style({
  position: 'relative',
  display: 'flex',
  minWidth: 0,
  maxWidth: '100%',
  padding: '6px 12px',
  border: `1px solid ${vars.color.border}`,
  borderRadius: '10px 16px 16px 10px',
  backgroundColor: vars.color.bgSecondary,
  fontSize: '0.8rem',
  lineHeight: 1.35,
  color: vars.color.textPrimary,
  '::before': {
    content: '""',
    position: 'absolute',
    left: '-4px',
    top: '50%',
    width: '7px',
    height: '7px',
    backgroundColor: vars.color.bgSecondary,
    borderLeft: `1px solid ${vars.color.border}`,
    borderBottom: `1px solid ${vars.color.border}`,
    transform: 'translateY(-50%) rotate(45deg)',
  },
});

export const statusText = style({
  minWidth: 0,
  display: '-webkit-box',
  WebkitLineClamp: 2,
  WebkitBoxOrient: 'vertical',
  overflow: 'hidden',
  overflowWrap: 'anywhere',
});
