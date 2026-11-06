import { keyframes, style } from '@vanilla-extract/css';
import { vars } from '@/theme/vars.css';
import { fast } from '@/theme/animations.css';

export const panel = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '8px',
  width: '360px',
  maxWidth: '100%',
  minHeight: 0,
  '@media': {
    // Same breakpoint the Popover uses to turn into a bottom sheet.
    '(max-width: 768px)': { width: '100%' },
  },
});

export const header = style({
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  color: vars.color.textPrimary,
  fontWeight: 700,
  fontSize: '1rem',
  padding: '2px 2px 0',
});

export const headerTitle = style({
  flex: 1,
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});

const iconBtnBase = style({
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '32px',
  height: '32px',
  flexShrink: 0,
  border: 'none',
  borderRadius: vars.radius.sm,
  backgroundColor: 'transparent',
  color: vars.color.textMuted,
  cursor: 'pointer',
  padding: 0,
  transition: `background-color ${fast}, color ${fast}`,
  ':hover': { backgroundColor: vars.color.bgHover, color: vars.color.textPrimary },
  ':focus-visible': { outline: `2px solid ${vars.color.accent}`, outlineOffset: '1px' },
  '@media': {
    '(pointer: coarse)': { width: '44px', height: '44px' },
  },
});

export const iconBtn = iconBtnBase;
export const iconBtnActive = style([
  iconBtnBase,
  { color: vars.color.accent, backgroundColor: vars.color.bgHover },
]);

export const search = style({
  width: '100%',
  boxSizing: 'border-box',
  height: '36px',
  padding: '0 10px',
  borderRadius: vars.radius.sm,
  border: `1px solid ${vars.color.border}`,
  backgroundColor: vars.color.bgInput,
  color: vars.color.textPrimary,
  fontSize: '0.9rem',
  outline: 'none',
  ':focus': { borderColor: vars.color.accent },
  '@media': {
    '(pointer: coarse)': { height: '44px', fontSize: '16px' },
  },
});

export const body = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '12px',
  minHeight: '120px',
  maxHeight: 'min(420px, 55dvh)',
  overflowY: 'auto',
  overscrollBehavior: 'contain',
  padding: '2px',
});

export const sectionLabel = style({
  color: vars.color.textMuted,
  fontSize: '0.72rem',
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  margin: '0 0 6px 2px',
});

export const grid = style({
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(104px, 1fr))',
  gap: '6px',
});

const shake = keyframes({
  '0%, 100%': { transform: 'translateX(0)' },
  '20%': { transform: 'translateX(-4px)' },
  '40%': { transform: 'translateX(4px)' },
  '60%': { transform: 'translateX(-3px)' },
  '80%': { transform: 'translateX(2px)' },
});

const fill = keyframes({
  from: { transform: 'scaleX(0)' },
  to: { transform: 'scaleX(1)' },
});

const padBase = style({
  position: 'relative',
  overflow: 'hidden',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '2px',
  minHeight: '64px',
  padding: '8px 6px',
  boxSizing: 'border-box',
  border: `1px solid ${vars.color.border}`,
  borderRadius: vars.radius.md,
  backgroundColor: vars.color.bgTertiary,
  color: vars.color.textPrimary,
  cursor: 'pointer',
  userSelect: 'none',
  WebkitTouchCallout: 'none',
  touchAction: 'manipulation',
  transition: `background-color ${fast}, transform ${fast}, border-color ${fast}`,
  ':hover': { backgroundColor: vars.color.bgHover },
  ':active': { transform: 'scale(0.96)', backgroundColor: vars.color.bgActive },
  ':focus-visible': { outline: `2px solid ${vars.color.accent}`, outlineOffset: '1px' },
  ':disabled': { opacity: 0.5, cursor: 'not-allowed', transform: 'none' },
  '@media': {
    '(pointer: coarse)': { minHeight: '72px' },
    '(prefers-reduced-motion: reduce)': { transition: 'none' },
  },
});

export const pad = padBase;
export const padPlaying = style([padBase, { borderColor: vars.color.success }]);
export const padShake = style([
  padBase,
  {
    borderColor: vars.color.warning,
    animation: `${shake} 320ms ease`,
    '@media': { '(prefers-reduced-motion: reduce)': { animation: 'none' } },
  },
]);
export const padEditing = style([
  padBase,
  { borderStyle: 'dashed', borderColor: vars.color.accent },
]);

export const padEmoji = style({
  fontSize: '1.5rem',
  lineHeight: 1,
});

export const padName = style({
  maxWidth: '100%',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  fontSize: '0.78rem',
  fontWeight: 600,
});

export const padProgress = style({
  position: 'absolute',
  left: 0,
  right: 0,
  bottom: 0,
  height: '3px',
  backgroundColor: vars.color.success,
  transformOrigin: 'left center',
  animationName: fill,
  animationTimingFunction: 'linear',
  animationFillMode: 'forwards',
});

export const padEditBadge = style({
  position: 'absolute',
  top: '4px',
  right: '4px',
  display: 'inline-flex',
  color: vars.color.accent,
});

export const addPad = style([
  padBase,
  {
    borderStyle: 'dashed',
    backgroundColor: 'transparent',
    color: vars.color.textMuted,
  },
]);

export const hint = style({
  margin: '0 0 6px 2px',
  color: vars.color.textMuted,
  fontSize: '0.8rem',
  lineHeight: 1.35,
});

export const empty = style({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '6px',
  padding: '24px 12px',
  color: vars.color.textMuted,
  fontSize: '0.85rem',
  textAlign: 'center',
});

const pulse = keyframes({
  '0%, 100%': { opacity: 0.45 },
  '50%': { opacity: 0.9 },
});

export const skeleton = style({
  minHeight: '64px',
  borderRadius: vars.radius.md,
  backgroundColor: vars.color.bgTertiary,
  animation: `${pulse} 1.2s ease-in-out infinite`,
  '@media': { '(prefers-reduced-motion: reduce)': { animation: 'none' } },
});

export const notice = style({
  minHeight: '18px',
  fontSize: '0.78rem',
  color: vars.color.warning,
  padding: '0 2px',
});

export const footer = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '8px',
  borderTop: `1px solid ${vars.color.border}`,
  paddingTop: '6px',
});

export const footerLink = style({
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px',
  minHeight: '32px',
  padding: '0 6px',
  border: 'none',
  borderRadius: vars.radius.sm,
  backgroundColor: 'transparent',
  color: vars.color.textMuted,
  fontSize: '0.8rem',
  cursor: 'pointer',
  ':hover': { backgroundColor: vars.color.bgHover, color: vars.color.textPrimary },
  ':focus-visible': { outline: `2px solid ${vars.color.accent}`, outlineOffset: '1px' },
  '@media': { '(pointer: coarse)': { minHeight: '44px' } },
});

export const footerNote = style({
  color: vars.color.textMuted,
  fontSize: '0.72rem',
});

/* Add / edit form */

export const form = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '10px',
  padding: '2px',
});

export const field = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '4px',
});

export const fieldRow = style({
  display: 'flex',
  gap: '8px',
});

export const label = style({
  color: vars.color.textMuted,
  fontSize: '0.75rem',
  fontWeight: 600,
});

export const input = style([
  search,
  {
    height: '36px',
  },
]);

export const emojiInput = style([input, { width: '72px', textAlign: 'center', flexShrink: 0 }]);

export const range = style({
  width: '100%',
  height: '28px',
  '@media': { '(pointer: coarse)': { height: '44px' } },
});

export const filePick = style({
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  minHeight: '40px',
  padding: '0 10px',
  border: `1px dashed ${vars.color.border}`,
  borderRadius: vars.radius.sm,
  backgroundColor: 'transparent',
  color: vars.color.textPrimary,
  fontSize: '0.85rem',
  cursor: 'pointer',
  textAlign: 'left',
  ':hover': { backgroundColor: vars.color.bgHover },
  ':focus-visible': { outline: `2px solid ${vars.color.accent}`, outlineOffset: '1px' },
  '@media': { '(pointer: coarse)': { minHeight: '48px' } },
});

export const fileName = style({
  flex: 1,
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});

export const error = style({
  color: vars.color.error,
  fontSize: '0.8rem',
});

export const actions = style({
  display: 'flex',
  gap: '8px',
  flexWrap: 'wrap',
});

const actionBase = style({
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '6px',
  minHeight: '36px',
  padding: '0 14px',
  border: `1px solid ${vars.color.border}`,
  borderRadius: vars.radius.sm,
  backgroundColor: 'transparent',
  color: vars.color.textPrimary,
  fontSize: '0.85rem',
  fontWeight: 600,
  cursor: 'pointer',
  ':hover': { backgroundColor: vars.color.bgHover },
  ':focus-visible': { outline: `2px solid ${vars.color.accent}`, outlineOffset: '1px' },
  ':disabled': { opacity: 0.55, cursor: 'not-allowed' },
  '@media': { '(pointer: coarse)': { minHeight: '44px' } },
});

export const action = actionBase;
export const actionPrimary = style([
  actionBase,
  {
    flex: 1,
    border: 'none',
    backgroundColor: vars.color.accent,
    color: '#fff',
    ':hover': { backgroundColor: vars.color.accentHover },
  },
]);
export const actionDanger = style([
  actionBase,
  { color: vars.color.danger, borderColor: vars.color.danger },
]);

export const credit = style({
  color: vars.color.textMuted,
  fontSize: '0.75rem',
});

/* Playing chip (participant rows and call tiles) */

export const chip = style({
  display: 'inline-flex',
  alignItems: 'center',
  gap: '3px',
  maxWidth: '120px',
  padding: '0 6px',
  borderRadius: '999px',
  backgroundColor: vars.color.accent,
  color: '#fff',
  fontSize: '0.64rem',
  fontWeight: 700,
  lineHeight: '15px',
  flexShrink: 0,
});

export const chipText = style({
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});

export const mutedIcon = style({
  position: 'relative',
  display: 'inline-flex',
  alignItems: 'center',
  color: vars.color.textMuted,
  flexShrink: 0,
});
