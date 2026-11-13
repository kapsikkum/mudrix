import { style } from '@vanilla-extract/css';
import { TABLET_QUERY } from '@/const/breakpoints';
import { TITLE_BAR_HEIGHT } from '@/app/components/TitleBar/TitleBar.css';
import { vars } from '@/theme/vars.css';
import { med, slideInRight, slideInUp } from '@/theme/animations.css';

const base = {
  width: '450px',
  position: 'relative',
  backgroundColor: vars.color.bgSecondary,
  borderLeft: `1px solid ${vars.color.border}`,
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
  flexShrink: 0,
  '@media': {
    '(max-width: 768px)': {
      // Bottom drawer, like the pickers and menus.
      position: 'fixed',
      left: 0,
      right: 0,
      top: 'auto',
      bottom: 0,
      width: 'auto',
      height: '80dvh',
      paddingBottom: 'env(safe-area-inset-bottom)',
      borderLeft: 'none',
      borderRadius: '20px 20px 0 0',
      boxShadow: vars.shadow.sheet,
      zIndex: 5000,
      transform: 'translateY(100%)',
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
} as const;

export const sidePanel = style(base);

export const sidePanelOpen = style({
  ...base,
  '@media': {
    '(max-width: 768px)': {
      position: 'fixed',
      left: 0,
      right: 0,
      top: 'auto',
      bottom: 0,
      height: '80dvh',
      zIndex: 5000,
      transform: 'translateY(0)',
      animation: `${slideInUp} ${med} ease`,
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
      animation: `${slideInRight} ${med} ease`,
    },
  },
});

export const sidePanelExpanded = style({
  flexGrow: 1,
});

export const sidePanelHeader = style({
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  padding: '12px',
  fontSize: '1rem',
  fontWeight: 700,
  color: vars.color.textMuted,
  letterSpacing: '0.04em',
  borderBottom: `1px solid ${vars.color.border}`,
  flexShrink: 0,
});

export const sidePanelTitle = style({
  fontSize: 'inherit',
  flex: 1,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});

export const sidePanelClose = style({
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
