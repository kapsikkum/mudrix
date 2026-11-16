import { style } from '@vanilla-extract/css';
import { PANEL_OVERLAY_QUERY } from '@/const/breakpoints';
import { vars } from '@/theme/vars.css';
import { med, slideInUp } from '@/theme/animations.css';
import { zIndex } from '@/theme/zIndex';
import { fontSize } from '@/theme/typeScale';

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
    [PANEL_OVERLAY_QUERY]: {
      // Bottom drawer, like the pickers and menus.
      position: 'fixed',
      left: 0,
      right: 0,
      top: 'auto',
      bottom: 0,
      // The desktop resizer sets an inline width.
      width: '100% !important',
      height: '80dvh',
      paddingBottom: 'var(--safe-bottom)',
      borderLeft: 'none',
      borderRadius: '20px 20px 0 0',
      boxShadow: vars.shadow.sheet,
      zIndex: zIndex.panel,
      transform: 'translateY(100%)',
      transition: `transform ${med} ease`,
    },
  },
} as const;

export const sidePanel = style(base);

export const sidePanelOpen = style({
  ...base,
  '@media': {
    [PANEL_OVERLAY_QUERY]: {
      position: 'fixed',
      left: 0,
      right: 0,
      top: 'auto',
      bottom: 0,
      height: '80dvh',
      zIndex: zIndex.panel,
      transform: 'translateY(0)',
      animation: `${slideInUp} ${med} ease`,
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
  fontSize: fontSize.md,
  fontWeight: 600,
  color: vars.color.textMuted,
  letterSpacing: '0.01em',
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
