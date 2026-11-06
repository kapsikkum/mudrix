import { style } from '@vanilla-extract/css';
import { vars } from '@/theme/vars.css';

export const keywordRow = style({
  display: 'flex',
  gap: '8px',
  marginTop: '12px',
  alignItems: 'center',
});

export const levelHint = style({
  display: 'inline-flex',
  verticalAlign: 'middle',
  alignItems: 'center',
  marginLeft: '6px',
  color: vars.color.textMuted,
  cursor: 'help',
  ':hover': {
    color: vars.color.textPrimary,
  },
});

export const keywordInput = style({
  flex: 1,
  minWidth: 0,
});

export const keywordButton = style({
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '6px',
  padding: '10px 14px',
  fontSize: '0.9rem',
  fontWeight: 500,
  color: vars.color.textPrimary,
  backgroundColor: vars.color.bgTertiary,
  borderRadius: vars.radius.sm,
  border: 'none',
  cursor: 'pointer',
  whiteSpace: 'nowrap',
  flexShrink: 0,
  ':hover': {
    backgroundColor: vars.color.bgHover,
  },
  ':disabled': {
    opacity: 0.5,
    cursor: 'not-allowed',
  },
});

export const keywordEmpty = style({
  marginTop: '12px',
});

export const keywordList = style({
  listStyle: 'none',
  margin: '12px 0 0',
  padding: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: '6px',
});

export const keywordItem = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '8px',
  padding: '8px 12px',
  backgroundColor: vars.color.bgSecondary,
  border: `1px solid ${vars.color.border}`,
  borderRadius: vars.radius.sm,
});

export const keywordText = style({
  fontSize: '0.9rem',
  color: vars.color.textPrimary,
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});

export const keywordDel = style({
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  border: 'none',
  background: 'none',
  color: vars.color.textMuted,
  cursor: 'pointer',
  borderRadius: vars.radius.sm,
  padding: '4px',
  flexShrink: 0,
  ':hover': {
    color: vars.color.error,
    backgroundColor: vars.color.bgHover,
  },
  ':disabled': {
    opacity: 0.5,
    cursor: 'not-allowed',
  },
});

export const errorText = style({
  color: vars.color.error,
  fontSize: '0.85rem',
  marginTop: '8px',
});

export const linkButton = style({
  border: 'none',
  background: 'none',
  padding: 0,
  fontSize: 'inherit',
  color: vars.color.accent,
  cursor: 'pointer',
  ':hover': {
    color: vars.color.accentHover,
    textDecoration: 'underline',
  },
});
