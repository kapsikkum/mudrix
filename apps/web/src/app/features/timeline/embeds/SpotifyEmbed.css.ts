import { style } from '@vanilla-extract/css';
import { vars } from '@/theme/vars.css';

export const player = style({
  width: '100%',
  maxWidth: '520px',
  marginTop: '8px',
  borderRadius: vars.radius.md,
  overflow: 'hidden',
  backgroundColor: vars.color.bgTertiary,
});

export const frame = style({
  display: 'block',
  width: '100%',
  height: '100%',
  border: 'none',
});

export const gate = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '100%',
  maxWidth: '520px',
  marginTop: '8px',
  padding: '13px 14px',
  borderRadius: vars.radius.md,
  border: `1px solid ${vars.color.border}`,
  backgroundColor: vars.color.bgSecondary,
  color: vars.color.textPrimary,
  fontSize: '13px',
  fontWeight: 500,
  cursor: 'pointer',
  ':hover': { backgroundColor: vars.color.bgHover },
});

export const prompt = style({
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '8px',
  width: '100%',
  maxWidth: '520px',
  marginTop: '8px',
  padding: '8px 12px',
  borderRadius: vars.radius.md,
  border: `1px solid ${vars.color.border}`,
  borderLeft: '4px solid #1db954',
  backgroundColor: vars.color.bgSecondary,
});

export const promptText = style({
  flex: '1 1 240px',
  fontSize: '12px',
  lineHeight: 1.4,
  color: vars.color.textSecondary,
});

export const promptActions = style({
  display: 'flex',
  flexShrink: 0,
  gap: '6px',
});

export const btn = style({
  padding: '5px 12px',
  borderRadius: vars.radius.sm,
  border: `1px solid ${vars.color.border}`,
  backgroundColor: 'transparent',
  color: vars.color.textPrimary,
  fontSize: '12px',
  cursor: 'pointer',
  ':hover': { backgroundColor: vars.color.bgHover },
});

export const btnPrimary = style([
  btn,
  { backgroundColor: vars.color.accent, borderColor: 'transparent', color: '#fff' },
]);
