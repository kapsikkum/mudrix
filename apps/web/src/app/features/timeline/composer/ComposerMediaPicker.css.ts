import { style } from '@vanilla-extract/css';
import { vars } from '@/theme/vars.css';
import { fontSize } from '@/theme/typeScale';

export const wrapper = style({
  width: '360px',
  height: '460px',
  backgroundColor: vars.color.bgSecondary,
  borderRadius: vars.radius.md,
  overflow: 'hidden',
  boxShadow: vars.shadow.popup,
  display: 'flex',
  flexDirection: 'column',
});

export const header = style({
  display: 'flex',
  alignItems: 'center',
  borderBottom: `1px solid ${vars.color.border}`,
  flexShrink: 0,
});

export const tabs = style({
  display: 'flex',
  flex: 1,
  minWidth: 0,
});

export const tab = style({
  flex: 1,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '6px',
  padding: '10px 8px',
  cursor: 'pointer',
  border: 'none',
  background: 'none',
  color: vars.color.textMuted,
  fontSize: fontSize.rem82,
  fontWeight: 500,
  borderBottom: '2px solid transparent',
  ':hover': {
    color: vars.color.textPrimary,
    backgroundColor: vars.color.bgHover,
  },
  ':focus-visible': {
    outline: `2px solid ${vars.color.accent}`,
    outlineOffset: -2,
  },
});

export const tabActive = style({
  color: vars.color.textPrimary,
  borderBottomColor: vars.color.accent,
});

export const closeBtn = style({
  width: '36px',
  height: '36px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
  border: 'none',
  background: 'none',
  color: vars.color.textMuted,
  flexShrink: 0,
  ':hover': {
    backgroundColor: vars.color.bgHover,
    color: vars.color.textPrimary,
  },
  ':focus-visible': {
    outline: `2px solid ${vars.color.accent}`,
    outlineOffset: -2,
  },
});

export const content = style({
  flex: 1,
  minHeight: 0,
  overflowY: 'auto',
  overscrollBehavior: 'contain',
  display: 'flex',
  flexDirection: 'column',
});

// Phones: sits in the flow below the message box, where the keyboard was, so the composer stays
// visible. Spans the composer's side and bottom padding.
export const wrapperDocked = style({
  margin: '0 -8px -9px',
  // About the height of the on-screen keyboard.
  height: 'clamp(300px, 40dvh, 440px)',
  backgroundColor: vars.color.bgSecondary,
  borderTop: `1px solid ${vars.color.border}`,
  borderRadius: '20px 20px 0 0',
  overflow: 'hidden',
  display: 'flex',
  flexDirection: 'column',
  flexShrink: 0,
});

export const drawerHandle = style({
  width: '40px',
  height: '4px',
  borderRadius: '2px',
  backgroundColor: vars.color.border,
  alignSelf: 'center',
  flexShrink: 0,
  margin: '8px 0 2px',
});
