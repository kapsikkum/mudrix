import { globalStyle, keyframes, style } from '@vanilla-extract/css';
import { vars } from '@/theme/vars.css';
import { fast, fadeIn, med } from '@/theme/animations.css';

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

const slideUp = keyframes({
  from: { transform: 'translateY(100%)' },
  to: { transform: 'translateY(0)' },
});

export const sheetBackdrop = style({
  position: 'fixed',
  inset: 0,
  zIndex: 9998,
  backgroundColor: 'rgba(0,0,0,0.5)',
  animation: `${fadeIn} ${med} ease`,
});

export const sheet = style({
  position: 'fixed',
  left: 0,
  right: 0,
  bottom: 0,
  zIndex: 9999,
  maxHeight: '75vh',
  overflowY: 'auto',
  backgroundColor: vars.color.bgTertiary,
  borderTop: `1px solid ${vars.color.border}`,
  borderRadius: '16px 16px 0 0',
  padding:
    '6px env(safe-area-inset-right) calc(8px + env(safe-area-inset-bottom)) env(safe-area-inset-left)',
  userSelect: 'none',
  outline: 'none',
  animation: `${slideUp} ${med} ease`,
});

export const sheetHandle = style({
  width: '36px',
  height: '4px',
  margin: '4px auto 8px',
  borderRadius: '2px',
  backgroundColor: vars.color.border,
});

globalStyle(`${sheet} [role^="menuitem"]`, {
  gap: '14px',
  minHeight: '48px',
  padding: '0 20px',
  fontSize: '1rem',
});

globalStyle(`${sheet} ${menuItemIcon}`, { width: '20px', height: '20px' });
globalStyle(`${sheet} ${menuItemIcon} svg`, { width: '20px', height: '20px' });
