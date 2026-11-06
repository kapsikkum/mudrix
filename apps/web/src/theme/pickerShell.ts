import type { StyleRule } from '@vanilla-extract/css';
import { vars } from './vars.css';
import { SHEET_RADIUS } from './sheet';
import { PANEL_OVERLAY_QUERY } from '@/const/breakpoints';

/** A picker on a phone: a bottom drawer across the screen instead of a popover by its anchor. */
export const pickerDrawer = {
  left: '0 !important',
  right: '0 !important',
  top: 'auto !important',
  bottom: '0 !important',
  width: 'auto',
  // About the height of the on-screen keyboard.
  height: 'clamp(300px, 40dvh, 440px)',
  borderRadius: `${SHEET_RADIUS} ${SHEET_RADIUS} 0 0`,
  paddingBottom: 'env(safe-area-inset-bottom)',
} satisfies StyleRule;

/** The emoji, GIF and sticker picker box: a floating popover, a bottom drawer on phones. */
export const pickerPopover = (width: string, height: string) =>
  ({
    width,
    height,
    backgroundColor: vars.color.bgSecondary,
    border: `1px solid ${vars.color.border}`,
    borderRadius: vars.radius.md,
    overflow: 'hidden',
    boxShadow: '0 8px 32px rgba(0,0,0,0.45)',
    display: 'flex',
    flexDirection: 'column',
    zIndex: 5000,
    '@media': {
      [PANEL_OVERLAY_QUERY]: { position: 'fixed', ...pickerDrawer },
    },
  }) satisfies StyleRule;

/** A picker that fills a host panel (the composer's tabbed picker) instead of floating. */
export const pickerNaked = {
  display: 'flex',
  flexDirection: 'column',
  flex: 1,
  minHeight: 0,
} satisfies StyleRule;
