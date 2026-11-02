import { style } from '@vanilla-extract/css';
import { vars } from '@/theme/vars.css';

export const popoverNaked = style({
  display: 'flex',
  flexDirection: 'column',
  flex: 1,
  minHeight: 0,
});

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

export const searchWrap = style({
  display: 'flex',
  alignItems: 'center',
  gap: '4px',
  padding: '8px 8px 0',
  flexShrink: 0,
});

export const searchInner = style({
  position: 'relative',
  flex: 1,
  minWidth: 0,
});

export const searchInput = style({
  width: '100%',
  padding: '6px 28px 6px 10px',
  backgroundColor: vars.color.bgPrimary,
  border: `1px solid ${vars.color.border}`,
  borderRadius: vars.radius.sm,
  color: vars.color.textPrimary,
  fontSize: '0.85rem',
  outline: 'none',
  '::placeholder': { color: vars.color.textMuted },
  ':focus': { borderColor: vars.color.accent },
  boxSizing: 'border-box',
});

export const searchClearBtn = style({
  position: 'absolute',
  right: '2px',
  top: '50%',
  transform: 'translateY(-50%)',
  width: '22px',
  height: '22px',
  borderRadius: vars.radius.sm,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
  border: 'none',
  background: 'none',
  color: vars.color.textMuted,
  ':hover': { backgroundColor: vars.color.bgHover, color: vars.color.textPrimary },
  ':focus-visible': {
    outline: `2px solid ${vars.color.accent}`,
    outlineOffset: 1,
  },
});

export const gridWrap = style({
  flex: 1,
  overflowY: 'auto',
  padding: '0 8px 8px',
});

export const masonry = style({
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  alignItems: 'start',
  gap: '6px',
  paddingTop: '6px',
});

export const masonryCol = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '6px',
  minWidth: 0,
});

export const gifItem = style({
  position: 'relative',
  width: '100%',
  overflow: 'hidden',
  borderRadius: vars.radius.sm,
  cursor: 'pointer',
  border: 'none',
  padding: 0,
  background: 'none',
  ':hover': { opacity: 0.85 },
  ':focus-visible': {
    outline: `2px solid ${vars.color.accent}`,
    outlineOffset: 1,
  },
});

export const gifImg = style({
  width: '100%',
  height: '100%',
  objectFit: 'cover',
  display: 'block',
});

export const favBtn = style({
  position: 'absolute',
  top: '4px',
  right: '4px',
  width: '24px',
  height: '24px',
  borderRadius: vars.radius.sm,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
  border: 'none',
  backgroundColor: 'rgba(0,0,0,0.5)',
  color: '#fff',
  backdropFilter: 'blur(2px)',
  opacity: 0,
  transition: 'opacity 120ms ease',
  selectors: {
    [`${gifItem}:hover &`]: { opacity: 1 },
    [`&[data-active="true"]`]: { opacity: 1, color: vars.color.accent },
    [`&[data-coarse="true"]`]: { opacity: 1 },
    [`&[aria-disabled="true"]`]: { cursor: 'default' },
    [`&[data-coarse="true"][aria-disabled="true"]`]: { opacity: 0.4 },
    [`${gifItem}:hover &[aria-disabled="true"]`]: { opacity: 0.4 },
  },
  ':hover': { backgroundColor: 'rgba(0,0,0,0.65)' },
  ':focus-visible': {
    outline: `2px solid ${vars.color.accent}`,
    outlineOffset: 1,
    opacity: 1,
  },
});

export const tabsSub = style({
  display: 'flex',
  alignItems: 'center',
  gap: '4px',
  padding: '6px 8px 0',
  flexShrink: 0,
});

export const tabSub = style({
  padding: '3px 8px',
  borderRadius: vars.radius.sm,
  fontSize: '0.82rem',
  cursor: 'pointer',
  border: 'none',
  background: 'none',
  color: vars.color.textMuted,
  ':hover': { backgroundColor: vars.color.bgHover, color: vars.color.textPrimary },
  ':focus-visible': {
    outline: `2px solid ${vars.color.accent}`,
    outlineOffset: 1,
  },
});

export const tabSubActive = style({
  backgroundColor: vars.color.bgPrimary,
  color: vars.color.textPrimary,
});

export const loadingState = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '40px 0',
  color: vars.color.textMuted,
});

export const emptyState = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  textAlign: 'center',
  padding: '60px 16px',
  color: vars.color.textMuted,
  fontSize: '0.9rem',
});

export const consentWrap = style({
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  textAlign: 'center',
  gap: '12px',
  padding: '24px 20px',
});

export const consentTitle = style({
  fontSize: '1rem',
  fontWeight: 700,
  color: vars.color.textPrimary,
});

export const consentBody = style({
  fontSize: '0.88rem',
  lineHeight: 1.5,
  color: vars.color.textMuted,
  maxWidth: '300px',
});

export const consentBtn = style({
  padding: '8px 16px',
  borderRadius: vars.radius.sm,
  border: 'none',
  backgroundColor: vars.color.accent,
  color: '#fff',
  fontSize: '0.85rem',
  fontWeight: 600,
  cursor: 'pointer',
  ':hover': { opacity: 0.9 },
  ':focus-visible': {
    outline: `2px solid ${vars.color.accent}`,
    outlineOffset: 1,
  },
});
