import { style } from '@vanilla-extract/css';
import { vars } from '@/theme/vars.css';

export const errorText = style({
  color: vars.color.danger,
  fontSize: '0.85rem',
  marginTop: '8px',
});
