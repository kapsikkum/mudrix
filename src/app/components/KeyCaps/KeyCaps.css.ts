import { style, styleVariants } from '@vanilla-extract/css';
import { vars } from '@/theme/vars.css';

export const caps = style({
  display: 'inline-flex',
  alignItems: 'center',
  gap: '3px',
  flexShrink: 0,
  verticalAlign: 'middle',
});

const cap = style({
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  boxSizing: 'border-box',
  border: `1px solid ${vars.color.border}`,
  borderBottomWidth: '2px',
  backgroundColor: vars.color.bgTertiary,
  fontFamily: 'inherit',
  fontWeight: 600,
  lineHeight: 1,
  color: vars.color.textSecondary,
  whiteSpace: 'nowrap',
});

export const key = styleVariants({
  md: [
    cap,
    {
      minWidth: '22px',
      height: '22px',
      padding: '0 6px',
      borderRadius: '5px',
      fontSize: '0.75rem',
    },
  ],
  sm: [
    cap,
    {
      minWidth: '18px',
      height: '18px',
      padding: '0 4px',
      borderRadius: '4px',
      fontSize: '0.68rem',
    },
  ],
});

export const labelWithKeys = style({
  display: 'inline-flex',
  alignItems: 'center',
  gap: '8px',
});
