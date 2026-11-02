import { style } from '@vanilla-extract/css';
import { vars } from '@/theme/vars.css';

export const wrapper = style({
  width: '360px',
  height: '460px',
  backgroundColor: vars.color.bgSecondary,
  borderRadius: vars.radius.md,
  overflow: 'hidden',
  boxShadow: '0 8px 32px rgba(0,0,0,0.45)',
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
  fontSize: '0.82rem',
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
  overflow: 'hidden',
  display: 'flex',
  flexDirection: 'column',
});
