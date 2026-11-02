import { style } from '@vanilla-extract/css';
import { vars } from '@/theme/vars.css';

export const metaRow = style({
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  fontSize: '0.85rem',
});

export const metaLabel = style({
  color: vars.color.textMuted,
  whiteSpace: 'nowrap',
  flexShrink: 0,
});

export const metaValue = style({
  color: vars.color.textPrimary,
  backgroundColor: vars.color.bgTertiary,
  padding: '2px 6px',
  borderRadius: vars.radius.sm,
  fontSize: '0.8rem',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  flex: 1,
});

export const section = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '6px',
});

export const sectionHeader = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
});

export const sectionTitle = style({
  fontSize: '0.85rem',
  fontWeight: 600,
  color: vars.color.textSecondary,
});

export const jsonBlock = style({
  backgroundColor: vars.color.bgTertiary,
  border: `1px solid ${vars.color.border}`,
  borderRadius: vars.radius.sm,
  padding: '12px',
  fontSize: '0.75rem',
  lineHeight: 1.4,
  color: vars.color.textPrimary,
  overflow: 'auto',
  maxHeight: '300px',
  margin: 0,
  whiteSpace: 'pre',
  fontFamily: 'monospace',
});
