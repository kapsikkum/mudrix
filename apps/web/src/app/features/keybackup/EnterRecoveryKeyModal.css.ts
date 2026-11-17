import { style } from '@vanilla-extract/css';
import { vars } from '@/theme/vars.css';
import { fontSize } from '@/theme/typeScale';

export const textarea = style({
  width: '100%',
  minHeight: '80px',
  padding: '10px 12px',
  backgroundColor: vars.color.bgInput,
  color: vars.color.textPrimary,
  border: `1px solid ${vars.color.border}`,
  borderRadius: vars.radius.sm,
  fontSize: fontSize.sm,
  fontFamily: 'monospace',
  resize: 'vertical',
  outline: 'none',
  boxSizing: 'border-box',
  ':focus': { borderColor: vars.color.accent },
});

export const iconMargin = style({
  marginRight: '6px',
});
