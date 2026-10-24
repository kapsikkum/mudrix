import { style } from '@vanilla-extract/css';
import { vars } from '@/theme/vars.css';

export const activeBadge = style({
  display: 'inline-flex',
  alignItems: 'center',
  gap: '5px',
  flexShrink: 0,
  padding: '4px 10px',
  borderRadius: '999px',
  fontSize: '0.8rem',
  fontWeight: 600,
  color: vars.color.success,
  backgroundColor: `color-mix(in srgb, ${vars.color.success} 14%, transparent)`,
});

export const buttonRow = style({
  display: 'flex',
  flexWrap: 'wrap',
  gap: '8px',
  marginTop: '10px',
});
