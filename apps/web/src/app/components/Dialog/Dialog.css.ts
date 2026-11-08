import { PANEL_OVERLAY_QUERY } from '@/const/breakpoints';
import { style, styleVariants } from '@vanilla-extract/css';
import { vars } from '@/theme/vars.css';
import { fadeIn, scaleIn, med } from '@/theme/animations.css';
import { zIndex } from '@/theme/zIndex';
import { fontSize } from '@/theme/typeScale';

export const overlay = style({
  position: 'fixed',
  inset: 0,
  backgroundColor: vars.scrim.modal,
  zIndex: zIndex.dialog,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding:
    'calc(24px + var(--safe-top)) calc(24px + var(--safe-right)) calc(24px + var(--safe-bottom)) calc(24px + var(--safe-left))',
  animation: `${fadeIn} ${med} ease`,
  '@media': {
    '(max-width: 768px)': {
      padding:
        'calc(16px + var(--safe-top)) calc(16px + var(--safe-right)) calc(16px + var(--safe-bottom)) calc(16px + var(--safe-left))',
    },
  },
});

const panelBase = style({
  backgroundColor: vars.color.bgSecondary,
  border: `1px solid ${vars.color.border}`,
  borderRadius: vars.radius.md,
  display: 'flex',
  flexDirection: 'column',
  maxHeight: '90vh',
  overflow: 'hidden',
  width: '100%',
  willChange: 'transform',
  backfaceVisibility: 'hidden',
  animation: `${scaleIn} ${med} ease`,
});

export const panel = style([panelBase, { outline: 'none' }]);

export const panelPrimary = style({
  backgroundColor: vars.color.bgPrimary,
});

export const panelFullscreenMobile = style({
  '@media': {
    [PANEL_OVERLAY_QUERY]: {
      position: 'fixed',
      top: 'var(--safe-top)',
      right: 'var(--safe-right)',
      bottom: 'var(--safe-bottom)',
      left: 'var(--safe-left)',
      width: 'auto !important',
      maxWidth: 'none !important',
      height: 'auto !important',
      maxHeight: 'none !important',
      borderRadius: 0,
      // Edge to edge, so there is no box outline to draw.
      border: 'none',
    },
  },
});

export const sizes = styleVariants({
  sm: { maxWidth: '380px' },
  md: { maxWidth: '460px' },
  lg: { maxWidth: '520px' },
  xl: { maxWidth: '640px' },
});

export const header = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '16px 20px',
  borderBottom: `1px solid ${vars.color.border}`,
  flexShrink: 0,
});

export const title = style({
  fontSize: fontSize.rem110,
  fontWeight: 700,
  color: vars.color.textPrimary,
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
});

export const titleIcon = style({
  display: 'flex',
  alignItems: 'center',
  color: vars.color.accent,
});

export const body = style({
  padding: '20px 24px',
  display: 'flex',
  flexDirection: 'column',
  gap: '14px',
  overflowY: 'auto',
  flex: 1,
  minHeight: 0,
});

export const footer = style({
  display: 'flex',
  justifyContent: 'flex-end',
  gap: '8px',
  padding: '12px 24px 20px',
  flexShrink: 0,
});

export const dialogMessage = style({
  color: vars.color.textMuted,
  fontSize: fontSize.rem95,
  margin: 0,
});
