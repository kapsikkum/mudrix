import { style } from '@vanilla-extract/css';
import { vars } from '@/theme/vars.css';
import { fontSize } from '@/theme/typeScale';

export const jsonTextarea = style({
  width: '100%',
  minHeight: '260px',
  padding: '10px 12px',
  backgroundColor: vars.color.bgInput,
  color: vars.color.textPrimary,
  border: `1px solid ${vars.color.border}`,
  borderRadius: vars.radius.sm,
  fontFamily: 'monospace',
  fontSize: fontSize.xs,
  lineHeight: '1.6',
  resize: 'vertical',
  outline: 'none',
  boxSizing: 'border-box',
  ':focus': { borderColor: vars.color.accent },
});

const validationRow = style({
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
  fontSize: fontSize.xs,
});

export const validOk = style([validationRow, { color: vars.color.success }]);

export const validErr = style([validationRow, { color: vars.color.danger }]);
