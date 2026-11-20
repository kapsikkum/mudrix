import { style } from '@vanilla-extract/css';
import { SIDE_PANEL_OVERLAY_QUERY } from '@/const/breakpoints';
import { vars } from '@/theme/vars.css';
import { med } from '@/theme/animations.css';
import { zIndex } from '@/theme/zIndex';
import { fontSize } from '@/theme/typeScale';

const base = {
  width: '260px',
  backgroundColor: vars.color.bgSecondary,
  borderLeft: `1px solid ${vars.color.border}`,
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
  flexShrink: 0,
  '@media': {
    // Phones and touch tablets: a panel over the chat, from the right edge.
    [SIDE_PANEL_OVERLAY_QUERY]: {
      position: 'fixed',
      right: 'var(--safe-right)',
      top: 'var(--safe-top)',
      bottom: 'var(--safe-bottom)',
      zIndex: zIndex.panel,
      transform: 'translateX(100%)',
      transition: `transform ${med} ease`,
    },
  },
} as const;

export const membersSidebar = style(base);

export const membersSidebarOpen = style({
  ...base,
  '@media': {
    [SIDE_PANEL_OVERLAY_QUERY]: {
      position: 'fixed',
      right: 'var(--safe-right)',
      top: 'var(--safe-top)',
      bottom: 'var(--safe-bottom)',
      zIndex: zIndex.panel,
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
    [SIDE_PANEL_OVERLAY_QUERY]: {
      width: '260px',
      minWidth: '260px',
      flex: '0 0 auto',
      overflow: 'hidden',
      borderLeft: `1px solid ${vars.color.border}`,
      padding: 'initial',
      position: 'fixed',
      right: 'var(--safe-right)',
      top: 'var(--safe-top)',
      bottom: 'var(--safe-bottom)',
      zIndex: zIndex.panel,
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
  fontSize: fontSize.md,
  fontWeight: 600,
  color: vars.color.textMuted,
  letterSpacing: '0.01em',
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
