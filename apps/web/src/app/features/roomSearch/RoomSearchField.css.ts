import { style } from '@vanilla-extract/css';
import { vars } from '@/theme/vars.css';
import { fast } from '@/theme/animations.css';

export const field = style({
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
  width: '100%',
  height: '28px',
  padding: '0 4px 0 8px',
  borderRadius: vars.radius.md,
  border: `1px solid ${vars.color.accent}`,
  backgroundColor: vars.color.bgSecondary,
  color: vars.color.textMuted,
});

export const scope = style({
  display: 'inline-flex',
  alignItems: 'center',
  gap: '3px',
  flexShrink: 1,
  minWidth: 0,
  maxWidth: '40%',
  padding: '2px 6px',
  borderRadius: vars.radius.sm,
  backgroundColor: `rgba(${vars.color.accentRgb}, 0.15)`,
  color: vars.color.textPrimary,
  fontSize: '0.75rem',
  fontWeight: 500,
});

export const scopeName = style({
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});

export const input = style({
  flex: 1,
  minWidth: 0,
  border: 'none',
  background: 'none',
  outline: 'none',
  color: vars.color.textPrimary,
  fontSize: '0.82rem',
  '::placeholder': { color: vars.color.textMuted },
});

export const count = style({
  flexShrink: 0,
  fontSize: '0.75rem',
  whiteSpace: 'nowrap',
});

export const iconBtn = style({
  width: '22px',
  height: '22px',
  flexShrink: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  border: 'none',
  borderRadius: vars.radius.sm,
  background: 'none',
  color: vars.color.textMuted,
  cursor: 'pointer',
  transition: `background-color ${fast}, color ${fast}`,
  ':disabled': { opacity: 0.35, cursor: 'not-allowed' },
  selectors: {
    '&:hover:not(:disabled)': {
      backgroundColor: vars.color.bgHover,
      color: vars.color.textPrimary,
    },
  },
});
