import { style } from '@vanilla-extract/css';
import { vars } from '@/theme/vars.css';
import { fast } from '@/theme/animations.css';

export const panel = style({
  marginTop: '12px',
  border: `1px solid ${vars.color.border}`,
  borderRadius: vars.radius.md,
  overflow: 'hidden',
});

export const toolbar = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '12px',
  padding: '8px 8px 8px 12px',
  backgroundColor: vars.color.bgTertiary,
  borderBottom: `1px solid ${vars.color.border}`,
});

export const count = style({
  fontSize: '0.8rem',
  color: vars.color.textMuted,
});

export const list = style({
  display: 'flex',
  flexDirection: 'column',
  maxHeight: '320px',
  overflowY: 'auto',
});

export const row = style({
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
  width: '100%',
  padding: '9px 12px',
  border: 'none',
  borderBottom: `1px solid ${vars.color.border}`,
  background: 'none',
  cursor: 'pointer',
  textAlign: 'left',
  color: vars.color.textPrimary,
  transition: `background-color ${fast}`,
  ':hover': { backgroundColor: vars.color.bgHover },
  selectors: {
    '&:last-child': { borderBottom: 'none' },
  },
});

export const rowType = style({
  flex: 1,
  minWidth: 0,
  fontSize: '0.82rem',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});

export const rowCaret = style({
  flexShrink: 0,
  color: vars.color.textMuted,
});

export const typeRow = style({
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  minWidth: 0,
});

export const typeValue = style({
  flex: 1,
  minWidth: 0,
  fontSize: '0.85rem',
  color: vars.color.textPrimary,
  overflowWrap: 'anywhere',
});

export const jsonEditor = style({
  fontFamily: 'monospace',
  fontSize: '0.78rem',
  lineHeight: 1.45,
  whiteSpace: 'pre',
  resize: 'vertical',
});
