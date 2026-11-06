import { globalStyle, style } from '@vanilla-extract/css';
import { vars } from '@/theme/vars.css';
import { med } from '@/theme/animations.css';
import { PANEL_OVERLAY_QUERY, TABLET_QUERY } from '@/const/breakpoints';
import { TITLE_BAR_HEIGHT } from '@/app/components/TitleBar/TitleBar.css';
import { spacesList } from './SpacesList.css';
import { bottomDock, roomList } from './RoomListPanel.css';
import { NATIVE_TAB_BAR, TAB_BAR_HEIGHT } from './MobileTabBar.css';
import { navList } from '@/app/components/Settings/Settings.css';

export const appFrame = style({
  display: 'flex',
  flexDirection: 'column',
  height: '100vh',
  overflow: 'hidden',
  backgroundColor: vars.color.bgPrimary,
});

export const appShell = style({
  display: 'flex',
  flex: 1,
  minHeight: 0,
  overflow: 'hidden',
  position: 'relative',
  backgroundColor: vars.color.bgPrimary,
  fontFamily: vars.font.body,
  color: vars.color.textPrimary,
  padding:
    'env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)',
  '@media': {
    '(max-width: 768px)': { paddingTop: 0 },
  },
});

export const sidebar = style({
  display: 'flex',
  flexShrink: 0,
  height: '100%',
  overflow: 'hidden',
  '@media': {
    '(max-width: 768px)': {
      position: 'fixed',
      left: 0,
      right: 0,
      top: 'calc(48px + env(safe-area-inset-top))',
      bottom: `calc(${TAB_BAR_HEIGHT}px + env(safe-area-inset-bottom))`,
      height: 'auto',
      zIndex: 5000,
      paddingLeft: 'env(safe-area-inset-left)',
      paddingRight: 'env(safe-area-inset-right)',
      backgroundColor: vars.color.bgPrimary,
      transform: 'translateX(-100%)',
      transition: `transform ${med} ease`,
    },
    // Touch tablets: the sidebar is a drawer under the title bar (a menu button there opens it)
    // instead of taking a third of the screen from the chat.
    [TABLET_QUERY]: {
      position: 'fixed',
      left: 'env(safe-area-inset-left)',
      top: `calc(env(safe-area-inset-top) + ${TITLE_BAR_HEIGHT}px)`,
      bottom: 'env(safe-area-inset-bottom)',
      height: 'auto',
      zIndex: 5000,
      backgroundColor: vars.color.bgPrimary,
      transform: 'translateX(-100%)',
      transition: `transform ${med} ease`,
    },
  },
});

export const sidebarNoRail = style({});
globalStyle(`${sidebarNoRail} ${spacesList}`, {
  '@media': { '(max-width: 768px)': { display: 'none' } },
});
globalStyle(`${sidebarNoRail} ${bottomDock}`, {
  '@media': { '(max-width: 768px)': { marginLeft: '8px' } },
});

export const sidebarOpen = style({
  '@media': {
    '(max-width: 768px)': {
      transform: 'translateX(0)',
    },
    [TABLET_QUERY]: {
      transform: 'translateX(0)',
      boxShadow: '8px 0 32px rgba(0, 0, 0, 0.35)',
    },
  },
});

export const mainContent = style({
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
  position: 'relative',
  backgroundColor: vars.color.bgSecondary,
});

export const mainContentHidden = style({
  '@media': {
    '(min-width: 769px) and (pointer: fine), (min-width: 1101px)': {
      display: 'none',
    },
  },
});

export const homeLayout = style({
  display: 'flex',
  height: '100%',
  minHeight: 0,
});

// Behind the tablet sidebar drawer.
export const panelDrawerOverlay = style({
  display: 'none',
  '@media': {
    [TABLET_QUERY]: {
      display: 'block',
      position: 'fixed',
      inset: 0,
      backgroundColor: 'rgba(0,0,0,0.5)',
      zIndex: 4999,
    },
  },
});

export const membersDrawerOverlay = style({
  display: 'none',
  '@media': {
    [PANEL_OVERLAY_QUERY]: {
      display: 'block',
      position: 'fixed',
      inset: 0,
      backgroundColor: 'rgba(0,0,0,0.5)',
      zIndex: 4999,
    },
  },
});

export const drawerOverlay = style({
  display: 'none',
  '@media': {
    [PANEL_OVERLAY_QUERY]: {
      display: 'block',
      position: 'fixed',
      inset: 0,
      backgroundColor: 'rgba(0,0,0,0.5)',
      zIndex: 4999,
    },
  },
});

// Opens the sidebar drawer; only touch tablets need it (phones have the mobile header, desktops
// keep the sidebar open).
export const titleBarMenuBtn = style({
  display: 'none',
  alignItems: 'center',
  justifyContent: 'center',
  width: '36px',
  height: '32px',
  border: 'none',
  borderRadius: vars.radius.sm,
  backgroundColor: 'transparent',
  color: vars.color.textMuted,
  cursor: 'pointer',
  '@media': {
    [TABLET_QUERY]: { display: 'flex' },
  },
  selectors: {
    '&:active': { backgroundColor: vars.color.bgHover, color: vars.color.textPrimary },
  },
});

export const mobileInbox = style({
  position: 'fixed',
  left: 0,
  right: 0,
  top: 'calc(48px + env(safe-area-inset-top))',
  bottom: `calc(${TAB_BAR_HEIGHT}px + env(safe-area-inset-bottom))`,
  zIndex: 5000,
  paddingLeft: 'env(safe-area-inset-left)',
  paddingRight: 'env(safe-area-inset-right)',
  backgroundColor: vars.color.bgPrimary,
});

const UNDER_TAB_BAR = `calc(${TAB_BAR_HEIGHT}px + env(safe-area-inset-bottom))`;
const mobileOnly = (rule: Record<string, string>) => ({ '@media': { '(max-width: 768px)': rule } });
globalStyle(
  `${NATIVE_TAB_BAR} ${sidebar}, ${NATIVE_TAB_BAR} ${mobileInbox}`,
  mobileOnly({ bottom: '0' })
);
globalStyle(`${NATIVE_TAB_BAR} ${roomList}`, mobileOnly({ paddingBottom: UNDER_TAB_BAR }));
globalStyle(
  `${NATIVE_TAB_BAR} ${spacesList}`,
  mobileOnly({ paddingBottom: `calc(var(--bottom-dock-inset, 72px) + ${UNDER_TAB_BAR})` })
);
globalStyle(
  `${NATIVE_TAB_BAR} ${bottomDock}`,
  mobileOnly({ marginBottom: `calc(${UNDER_TAB_BAR} + 8px)` })
);
globalStyle(`${NATIVE_TAB_BAR} ${mobileInbox} ${navList}`, { paddingBottom: UNDER_TAB_BAR });
globalStyle(`${mobileInbox} ${navList}`, { height: '100%' });
