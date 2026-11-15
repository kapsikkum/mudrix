import { style } from '@vanilla-extract/css';
import { vars } from '@/theme/vars.css';
import { fontSize } from '@/theme/typeScale';

export const dialogBody = style({
  padding: 0,
  gap: 0,
  overflow: 'hidden',
});

export const searchBar = style({
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
  padding: '12px 16px',
  borderBottom: `1px solid ${vars.color.border}`,
  flexShrink: 0,
});

export const searchIcon = style({
  color: vars.color.accent,
  flexShrink: 0,
});

export const searchInput = style({
  flex: 1,
  background: 'transparent',
  border: 'none',
  outline: 'none',
  fontSize: fontSize.md,
  color: vars.color.textPrimary,
  '::placeholder': { color: vars.color.textMuted },
});

export const results = style({
  flex: 1,
  overflowY: 'auto',
  padding: '4px 0',
  maxHeight: '264px',
});

export const resultItem = style({
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
  padding: '8px 16px',
  cursor: 'pointer',
  userSelect: 'none',
  selectors: {
    '&:hover, &[data-highlighted="true"]': {
      backgroundColor: vars.color.bgHover,
    },
  },
});

export const resultName = style({
  flex: 1,
  fontSize: fontSize.sm,
  color: vars.color.textPrimary,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});

export const resultItemLoading = style({
  opacity: 0.5,
  pointerEvents: 'none',
});

export const highlight = style({
  color: vars.color.textPrimary,
  fontWeight: 600,
  backgroundColor: `rgba(${vars.color.accentRgb}, 0.2)`,
  borderRadius: '2px',
  padding: '0 1px',
});

export const typeIcon = style({
  color: vars.color.textMuted,
  flexShrink: 0,
  display: 'flex',
  justifyContent: 'center',
  width: '28px',
});

export const emptyState = style({
  padding: '24px 16px',
  textAlign: 'center',
  color: vars.color.textMuted,
  fontSize: fontSize.sm,
});

export const footer = style({
  display: 'flex',
  alignItems: 'center',
  gap: '16px',
  padding: '8px 16px',
  borderTop: `1px solid ${vars.color.border}`,
  flexShrink: 0,
});

export const footerHint = style({
  fontSize: fontSize.xs,
  color: vars.color.textMuted,
  display: 'flex',
  alignItems: 'center',
  gap: '4px',
});
