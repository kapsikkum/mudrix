import { style } from '@vanilla-extract/css';
import { vars } from '@/theme/vars.css';

export const popover = style({
  width: '360px',
  height: '440px',
  backgroundColor: vars.color.bgSecondary,
  border: `1px solid ${vars.color.border}`,
  borderRadius: vars.radius.md,
  overflow: 'hidden',
  boxShadow: '0 8px 32px rgba(0,0,0,0.45)',
  display: 'flex',
  flexDirection: 'column',
  zIndex: 5000,
});

export const header = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '8px 8px',
  borderBottom: `1px solid ${vars.color.border}`,
  flexShrink: 0,
});

export const headerTitle = style({
  fontSize: '0.85rem',
  fontWeight: 600,
  color: vars.color.textMuted,
  letterSpacing: '0.05em',
  paddingLeft: '4px',
});

export const closeBtn = style({
  width: '24px',
  height: '24px',
  borderRadius: vars.radius.sm,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
  border: 'none',
  color: vars.color.textMuted,
  fontSize: '0.8rem',
  ':hover': { backgroundColor: vars.color.bgHover, color: vars.color.textPrimary },
  ':focus-visible': {
    outline: `2px solid ${vars.color.accent}`,
    outlineOffset: 1,
  },
});

export const iframeWrap = style({
  flex: 1,
  position: 'relative',
});

export const iframe = style({
  position: 'absolute',
  inset: 0,
  width: '100%',
  height: '100%',
  border: 'none',
  backgroundColor: vars.color.bgSecondary,
});

export const loadingState = style({
  position: 'absolute',
  inset: 0,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '8px',
  color: vars.color.textMuted,
  fontSize: '0.9rem',
});
