import { globalStyle, style } from '@vanilla-extract/css';
import { vars } from '@/theme/vars.css';
import { med } from '@/theme/animations.css';
import { PANEL_OVERLAY_QUERY, TABLET_QUERY } from '@/const/breakpoints';
import { TITLE_BAR_HEIGHT } from '@/app/components/TitleBar/TitleBar.css';
import { spacesList } from './SpacesList.css';
import { bottomDock, roomList } from './RoomListPanel.css';
import { NATIVE_TAB_BAR, TAB_BAR_HEIGHT } from './MobileTabBar.css';
import { navList } from '@/app/components/Settings/Settings.css';
import { mobileHeader } from './MobileHeader.css';
import { zIndex } from '@/theme/zIndex';

export const appFrame = style({
  display: 'flex',
  flexDirection: 'column',
  height: '100vh',
  overflow: 'hidden',
  backgroundColor: vars.color.bgPrimary,
  selectors: {
    // Fills the phone shell's web view, which Android and the iOS plugin end at the keyboard; older
    // iOS builds set --vvh to the visual viewport so the keyboard shrinks the app instead of panning it.
    'html.tauri-mobile &': { height: 'var(--vvh, 100dvh)' },
  },
});

export const appShell = style({
  display: 'flex',
  flex: 1,
  minHeight: 0,
  overflow: 'hidden',
  position: 'relative',
  backgroundColor: vars.color.bgPrimary,
  // The strips under the status bar and beside the home indicator take the colour of the bar next
  // to them: the header (bgSecondary) on top, the composer (bgSecondary) below when there is one.
  backgroundImage: `linear-gradient(to bottom, ${vars.color.bgSecondary} var(--safe-top), transparent var(--safe-top), transparent calc(100% - var(--safe-bottom)), var(--edge-bottom, transparent) calc(100% - var(--safe-bottom)))`,
  fontFamily: vars.font.body,
  color: vars.color.textPrimary,
  padding: 'var(--safe-top) var(--safe-right) var(--safe-bottom) var(--safe-left)',
  selectors: {
    '&:has([data-composer])': { vars: { '--edge-bottom': vars.color.bgSecondary } },
    // The mobile header already clears the top inset.
    [`${mobileHeader} ~ &`]: { paddingTop: 0 },
  },
});

export const sidebar = style({
  display: 'flex',
  flexShrink: 0,
  height: '100%',
  overflow: 'hidden',
  '@media': {
    // Phones and touch tablets: a drawer that slides in over the chat.
    [PANEL_OVERLAY_QUERY]: {
      position: 'fixed',
      left: 'var(--safe-left)',
      top: 'var(--safe-top)',
      bottom: 'var(--safe-bottom)',
      // Top and bottom already size it; 100% on top of the offset would run off the screen.
      height: 'auto',
      zIndex: zIndex.panel,
      transform: 'translateX(-100%)',
      transition: `transform ${med} ease`,
    },
    // Tablets keep the title bar (and its menu button) uncovered.
    [TABLET_QUERY]: {
      top: `calc(var(--safe-top) + ${TITLE_BAR_HEIGHT}px)`,
      height: 'auto',
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
    [PANEL_OVERLAY_QUERY]: {
      transform: 'translateX(0)',
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
    '(min-width: 769px)': {
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
    [PANEL_OVERLAY_QUERY]: {
      display: 'block',
      position: 'fixed',
      inset: 0,
      backgroundColor: vars.scrim.base,
      zIndex: zIndex.panelScrim,
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
      backgroundColor: vars.scrim.base,
      zIndex: zIndex.panelScrim,
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
      backgroundColor: vars.scrim.base,
      zIndex: zIndex.panelScrim,
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
