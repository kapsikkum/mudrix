import { style } from '@vanilla-extract/css';
import { TABLET_QUERY } from '@/const/breakpoints';
import { TITLE_BAR_HEIGHT } from '@/app/components/TitleBar/TitleBar.css';
import { vars } from '@/theme/vars.css';
import { med } from '@/theme/animations.css';

const base = {
  width: '260px',
  backgroundColor: vars.color.bgSecondary,
  borderLeft: `1px solid ${vars.color.border}`,
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
  flexShrink: 0,
  '@media': {
    '(max-width: 768px)': {
      position: 'fixed',
      left: 'env(safe-area-inset-left)',
      right: 'env(safe-area-inset-right)',
      top: 'env(safe-area-inset-top)',
      bottom: 'env(safe-area-inset-bottom)',
      width: 'auto',
      borderLeft: 'none',
      zIndex: 5000,
      transform: 'translateX(100%)',
      transition: `transform ${med} ease`,
    },
  },
} as const;

export const membersSidebar = style(base);

export const membersSidebarOpen = style({
  ...base,
  '@media': {
    '(max-width: 768px)': {
      position: 'fixed',
      left: 'env(safe-area-inset-left)',
      right: 'env(safe-area-inset-right)',
      top: 'env(safe-area-inset-top)',
      bottom: 'env(safe-area-inset-bottom)',
      width: 'auto',
      borderLeft: 'none',
      zIndex: 5000,
      transform: 'translateX(0)',
      transition: `transform ${med} ease`,
    },
    // Touch tablets: a drawer on the right under the title bar, not a full-screen page.
    [TABLET_QUERY]: {
      position: 'fixed',
      left: 'auto',
      right: 'env(safe-area-inset-right)',
      top: `calc(env(safe-area-inset-top) + ${TITLE_BAR_HEIGHT}px)`,
      bottom: 'env(safe-area-inset-bottom)',
      width: '360px !important',
      minWidth: 0,
      flex: '0 0 auto',
      padding: 'initial',
      borderLeft: `1px solid ${vars.color.border}`,
      zIndex: 5000,
      transform: 'translateX(0)',
      transition: `transform ${med} ease`,
    },
  },
});

export const membersSidebarClosed = style({
  ...base,
  width: '0px',
  minWidth: '0px',
  flex: '0 0 0px',
  overflow: 'hidden',
  borderLeft: 'none',
  padding: 0,
  '@media': {
    '(max-width: 768px)': {
      width: 'auto',
      minWidth: 0,
      flex: '0 0 auto',
      overflow: 'hidden',
      padding: 'initial',
      position: 'fixed',
      left: 'env(safe-area-inset-left)',
      right: 'env(safe-area-inset-right)',
      top: 'env(safe-area-inset-top)',
      bottom: 'env(safe-area-inset-bottom)',
      zIndex: 5000,
      transform: 'translateX(100%)',
      transition: `transform ${med} ease`,
    },
    // Touch tablets: a drawer on the right under the title bar, not a full-screen page.
    [TABLET_QUERY]: {
      position: 'fixed',
      left: 'auto',
      right: 'env(safe-area-inset-right)',
      top: `calc(env(safe-area-inset-top) + ${TITLE_BAR_HEIGHT}px)`,
      bottom: 'env(safe-area-inset-bottom)',
      width: '360px !important',
      minWidth: 0,
      flex: '0 0 auto',
      padding: 'initial',
      borderLeft: `1px solid ${vars.color.border}`,
      zIndex: 5000,
      transform: 'translateX(100%)',
      transition: `transform ${med} ease`,
    },
  },
});

export const membersSidebarHeader = style({
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  padding: '12px',
  borderBottom: `1px solid ${vars.color.border}`,
  flexShrink: 0,
});

export const membersSidebarTitle = style({
  flex: 1,
  fontSize: '1rem',
  fontWeight: 700,
  color: vars.color.textMuted,
  letterSpacing: '0.04em',
});

export const membersSidebarClose = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '24px',
  height: '24px',
  borderRadius: vars.radius.sm,
  border: 'none',
  backgroundColor: 'transparent',
  color: vars.color.textMuted,
  cursor: 'pointer',
  flexShrink: 0,
  ':hover': {
    backgroundColor: vars.color.bgHover,
    color: vars.color.textPrimary,
  },
});

export const membersList = style({
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  minHeight: 0,
  overflow: 'hidden',
});
