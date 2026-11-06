import { globalStyle, keyframes, style } from '@vanilla-extract/css';
import { vars } from '@/theme/vars.css';
import { fast, fadeIn } from '@/theme/animations.css';
import { SHEET_RADIUS, SHEET_SCRIM, SHEET_SHADOW } from '@/theme/sheet';

export const menu = style({
  position: 'fixed',
  zIndex: 9999,
  minWidth: '180px',
  backgroundColor: vars.color.bgTertiary,
  border: `1px solid ${vars.color.border}`,
  borderRadius: vars.radius.md,
  boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
  padding: '4px 0',
  userSelect: 'none',
});

export const menuSubmenu = style({
  position: 'fixed',
  zIndex: 10000,
  minWidth: '168px',
  maxWidth: '220px',
  backgroundColor: vars.color.bgTertiary,
  border: `1px solid ${vars.color.border}`,
  borderRadius: vars.radius.md,
  boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
  padding: '4px 0',
  userSelect: 'none',
});

export const menuItem = style({
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
  padding: '8px 14px',
  fontSize: '0.88rem',
  color: vars.color.textPrimary,
  cursor: 'pointer',
  transition: `background-color ${fast}`,
  selectors: {
    '&:hover': {
      backgroundColor: vars.color.bgHover,
    },
    '&:focus': {
      outline: 'none',
    },
    '&:focus-visible': {
      outline: `2px solid ${vars.color.accent}`,
      outlineOffset: '-2px',
    },
    '[data-suppress-hover="true"] &:hover': {
      backgroundColor: 'transparent',
    },
  },
});

export const menuItemActive = style({
  backgroundColor: vars.color.bgHover,
});

export const menuItemDangerActive = style({
  backgroundColor: 'rgba(255, 107, 107, 0.12)',
});

export const menuItemDanger = style([
  menuItem,
  {
    color: vars.color.error,
    ':hover': {
      backgroundColor: 'rgba(255, 107, 107, 0.12)',
    },
    selectors: {
      '[data-suppress-hover="true"] &:hover': {
        backgroundColor: 'transparent',
      },
    },
  },
]);

export const menuItemIcon = style({
  width: '14px',
  height: '14px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  opacity: 0.75,
  flexShrink: 0,
});

export const menuItemDisabled = style([
  menuItem,
  {
    opacity: 0.4,
    cursor: 'default',
    ':hover': {
      backgroundColor: 'transparent',
    },
  },
]);

export const menuItemLabel = style({
  flex: 1,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});

export const menuItemCheck = style({
  color: vars.color.accent,
  fontSize: '0.8rem',
  flexShrink: 0,
});

export const menuItemCarat = style({
  opacity: 0.6,
  flexShrink: 0,
});

export const menuDivider = style({
  height: '1px',
  backgroundColor: vars.color.border,
  margin: '4px 0',
});

// Touch layout: a bottom sheet (like Element X) instead of a floating menu. It follows the finger
// down to dismiss (useSwipeDownDismiss), so it only animates transform and opacity.
const sheetIn = keyframes({
  from: { transform: 'translateY(100%)' },
  to: { transform: 'translateY(0)' },
});

export const sheetBackdrop = style({
  position: 'fixed',
  inset: 0,
  zIndex: 9998,
  backgroundColor: SHEET_SCRIM,
  animation: `${fadeIn} 160ms ease-out`,
  '@media': { '(prefers-reduced-motion: reduce)': { animation: 'none' } },
});

export const sheet = style({
  position: 'fixed',
  left: 0,
  right: 0,
  bottom: 0,
  zIndex: 9999,
  display: 'flex',
  flexDirection: 'column',
  maxHeight: '78vh',
  backgroundColor: vars.color.bgTertiary,
  borderTopLeftRadius: SHEET_RADIUS,
  borderTopRightRadius: SHEET_RADIUS,
  boxShadow: SHEET_SHADOW,
  paddingBottom: 'max(12px, env(safe-area-inset-bottom))',
  userSelect: 'none',
  touchAction: 'pan-y',
  outline: 'none',
  animation: `${sheetIn} 220ms cubic-bezier(0.2, 0.9, 0.3, 1)`,
  '@media': { '(prefers-reduced-motion: reduce)': { animation: 'none' } },
});

export const sheetGrabber = style({
  flexShrink: 0,
  display: 'flex',
  justifyContent: 'center',
  padding: '10px 0 6px',
  touchAction: 'none',
  cursor: 'grab',
  outline: 'none',
});

export const sheetGrabberBar = style({
  width: '40px',
  height: '4px',
  borderRadius: '2px',
  backgroundColor: vars.color.textMuted,
  opacity: 0.5,
});

export const sheetList = style({
  overflowY: 'auto',
  overscrollBehavior: 'contain',
  padding: '4px 8px',
});

export const sheetBack = style({
  display: 'flex',
  alignItems: 'center',
  gap: '12px',
  minHeight: '52px',
  padding: '0 16px',
  fontSize: '1rem',
  fontWeight: 600,
  color: vars.color.textPrimary,
  borderBottom: `1px solid ${vars.color.border}`,
  cursor: 'pointer',
  flexShrink: 0,
  outline: 'none',
});

// Bigger rows and icons inside the sheet, without a second set of item classes.
globalStyle(`${sheet} [role="menuitem"]:not(${sheetBack}), ${sheet} [role="menuitemcheckbox"]`, {
  minHeight: '52px',
  padding: '0 16px',
  gap: '16px',
  fontSize: '1rem',
  borderRadius: '12px',
});

globalStyle(`${sheet} [role="menuitem"]:active, ${sheet} [role="menuitemcheckbox"]:active`, {
  backgroundColor: vars.color.bgHover,
});

globalStyle(`${sheet} ${menuItemIcon}`, {
  width: '24px',
  height: '24px',
  opacity: 0.9,
});

globalStyle(`${sheet} ${menuItemIcon} svg`, {
  width: '22px',
  height: '22px',
});

globalStyle(`${sheet} ${menuItemLabel}`, {
  whiteSpace: 'normal',
});

globalStyle(`${sheet} ${menuDivider}`, {
  margin: '6px 8px',
});

// The one-tap reactions row at the top of a message's sheet.
export const quickRow = style({
  display: 'flex',
  justifyContent: 'space-between',
  gap: '4px',
  padding: '4px 16px 10px',
  borderBottom: `1px solid ${vars.color.border}`,
  flexShrink: 0,
});

export const quickBtn = style({
  flex: 1,
  minWidth: 0,
  height: '52px',
  border: 'none',
  borderRadius: '14px',
  background: 'none',
  fontSize: '1.7rem',
  lineHeight: 1,
  cursor: 'pointer',
  selectors: { '&:active': { backgroundColor: vars.color.bgHover } },
});

export const quickBtnActive = style([
  quickBtn,
  { backgroundColor: `rgba(${vars.color.accentRgb}, 0.2)` },
]);
