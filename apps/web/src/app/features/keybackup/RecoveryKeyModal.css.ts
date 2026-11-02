import { style } from '@vanilla-extract/css';
import { vars } from '@/theme/vars.css';

export const keyBox = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '8px',
  backgroundColor: vars.color.bgTertiary,
  border: `1px solid ${vars.color.border}`,
  borderRadius: vars.radius.sm,
  padding: '10px 14px',
});

export const keyActions = style({
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
  flexShrink: 0,
});

export const keyText = style({
  fontFamily: 'monospace',
  fontSize: '0.9rem',
  color: vars.color.textPrimary,
  wordBreak: 'break-all',
  flex: 1,
  userSelect: 'all',
});

export const alertIcon = style({
  marginTop: '2px',
  flexShrink: 0,
});

export const copyBtn = style({
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '6px',
  flexShrink: 0,
  padding: '4px 10px',
  borderRadius: vars.radius.sm,
  fontSize: '0.8rem',
  fontWeight: 500,
  cursor: 'pointer',
  border: `1px solid ${vars.color.border}`,
  backgroundColor: vars.color.bgSecondary,
  color: vars.color.textMuted,
  ':hover': { color: vars.color.textPrimary, borderColor: vars.color.accent },
});

export const downloadBtn = style([
  copyBtn,
  {
    ':hover': { color: vars.color.accent, borderColor: vars.color.accent },
  },
]);

const alertBase = style({
  borderRadius: vars.radius.sm,
  padding: '10px 14px',
  fontSize: '0.85rem',
  display: 'flex',
  gap: '8px',
  alignItems: 'flex-start',
  lineHeight: '1.5',
});

export const alertWarning = style([
  alertBase,
  {
    backgroundColor: 'rgba(255,165,0,0.1)',
    border: '1px solid rgba(255,165,0,0.45)',
    color: 'orange',
  },
]);

export const alertDanger = style([
  alertBase,
  {
    backgroundColor: 'rgba(237,66,69,0.1)',
    border: '1px solid rgba(237,66,69,0.45)',
    color: '#f87171',
  },
]);

export const hint = style({
  fontSize: '0.85rem',
  color: vars.color.textMuted,
  lineHeight: '1.55',
});
