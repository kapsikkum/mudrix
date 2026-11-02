import { style } from '@vanilla-extract/css';
import { vars } from '@/theme/vars.css';

export const sectionTitle = style({
  fontSize: '0.75rem',
  fontWeight: 700,
  letterSpacing: '0.06em',
  color: vars.color.textMuted,
  marginBottom: '12px',
  marginTop: '4px',
});

export const sectionGap = style({
  marginBottom: '28px',
});

export const divider = style({
  height: '1px',
  backgroundColor: vars.color.border,
  margin: '24px 0',
});

export const card = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '10px',
  padding: '16px',
  backgroundColor: vars.color.bgSecondary,
  border: `1px solid ${vars.color.border}`,
  borderRadius: vars.radius.md,
});

export const cardInfo = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '2px',
  minWidth: 0,
});

export const cardName = style({
  fontSize: '0.9rem',
  fontWeight: 600,
  color: vars.color.textPrimary,
});

export const widgetList = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '8px',
});

export const widgetRow = style({
  display: 'flex',
  alignItems: 'center',
  gap: '12px',
  padding: '12px 14px',
  backgroundColor: vars.color.bgSecondary,
  border: `1px solid ${vars.color.border}`,
  borderRadius: vars.radius.md,
});

export const widgetRowIcon = style({
  width: '32px',
  height: '32px',
  borderRadius: vars.radius.sm,
  backgroundColor: vars.color.bgTertiary,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: '0.9rem',
  color: vars.color.accent,
  flexShrink: 0,
});

export const widgetRowInfo = style({
  flex: 1,
  minWidth: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: '2px',
});

export const widgetRowName = style({
  fontSize: '0.88rem',
  fontWeight: 600,
  color: vars.color.textPrimary,
});

export const widgetRowUrl = style({
  fontSize: '0.76rem',
  color: vars.color.textMuted,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  fontFamily: 'monospace',
});

export const widgetRowActions = style({
  display: 'flex',
  alignItems: 'center',
  gap: '4px',
  flexShrink: 0,
});

export const emptyState = style({
  padding: '20px',
  textAlign: 'center',
  color: vars.color.textMuted,
  fontSize: '0.85rem',
  backgroundColor: vars.color.bgSecondary,
  border: `1px dashed ${vars.color.border}`,
  borderRadius: vars.radius.md,
  fontStyle: 'italic',
});

export const dangerIcon = style({
  color: vars.color.danger,
});

export const jsonTextarea = style({
  width: '100%',
  minHeight: '120px',
  padding: '10px 12px',
  backgroundColor: vars.color.bgInput,
  color: vars.color.textPrimary,
  border: `1px solid ${vars.color.border}`,
  borderRadius: vars.radius.sm,
  fontFamily: 'monospace',
  fontSize: '0.82rem',
  lineHeight: '1.5',
  resize: 'vertical',
  outline: 'none',
  boxSizing: 'border-box',
  ':focus': { borderColor: vars.color.accent },
});
