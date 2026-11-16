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

export const threadPanel = style(base);

export const threadPanelOpen = style({
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

export const threadPanelExpanded = style({
  flexGrow: 1,
});

export const threadPanelHeader = style({
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

export const threadPanelLabel = style({
  fontSize: 'inherit',
  flexShrink: 0,
});

export const threadPanelTitle = style({
  flex: 1,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});

export const threadPanelDivider = style({
  width: '3px',
  height: '3px',
  borderRadius: '50%',
  backgroundColor: vars.color.textMuted,
  flexShrink: 0,
  opacity: 0.5,
});

export const threadPanelBack = style({
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

export const threadPanelClose = style({
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

export const threadRootWrap = style({
  padding: '12px',
  borderBottom: `1px solid ${vars.color.border}`,
  flexShrink: 0,
  fontSize: fontSize.sm,
});

export const threadRootMeta = style({
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  marginBottom: '4px',
});

export const threadRootSender = style({
  fontWeight: 600,
  color: vars.color.textPrimary,
  fontSize: fontSize.sm,
});

export const threadRootTime = style({
  color: vars.color.textMuted,
  fontSize: fontSize.xs,
  flexShrink: 0,
});

export const threadRootContent = style({
  color: vars.color.textPrimary,
  fontSize: fontSize.sm,
  lineHeight: '1.5',
  wordBreak: 'break-word',
  overflow: 'hidden',
  display: '-webkit-box',
  WebkitLineClamp: 3,
  WebkitBoxOrient: 'vertical',
});

export const threadRootUndecryptable = style({
  display: 'inline-flex',
  alignItems: 'center',
  gap: '4px',
  color: vars.color.textMuted,
  fontSize: fontSize.sm,
});

export const threadReplyList = style({
  flex: 1,
  overflowY: 'auto',
  display: 'flex',
  flexDirection: 'column',
  padding: '8px 0',
  minHeight: 0,
});

export const dateSeparator = style({
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
  padding: '12px 12px 4px',
  fontSize: fontSize.xs,
  color: vars.color.textMuted,
  fontWeight: 600,
  letterSpacing: '0.01em',
  '::before': { content: '""', flex: 1, height: '1px', backgroundColor: vars.color.border },
  '::after': { content: '""', flex: 1, height: '1px', backgroundColor: vars.color.border },
});

export const threadLoading = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '24px',
  color: vars.color.textMuted,
  fontSize: fontSize.sm,
  flex: 1,
});

export const threadEmpty = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '32px 16px',
  color: vars.color.textMuted,
  fontSize: fontSize.sm,
  flex: 1,
});

export const threadComposerBg = style({
  backgroundColor: vars.color.bgSecondary,
});
