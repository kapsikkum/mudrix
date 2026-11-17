import { style } from '@vanilla-extract/css';
import { vars } from '@/theme/vars.css';
import { fontSize } from '@/theme/typeScale';

export const bar = style({
  flexShrink: 0,
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  padding: '6px 10px',
  borderTop: `1px solid ${vars.color.border}`,
  backgroundColor: vars.color.bgTertiary,
});

export const image = style({
  width: 28,
  height: 28,
  objectFit: 'contain',
  flexShrink: 0,
  borderRadius: 4,
});

export const emoji = style({
  width: 28,
  fontSize: fontSize.xl,
  lineHeight: 1,
  textAlign: 'center',
  flexShrink: 0,
});

export const text = style({
  fontSize: fontSize.sm,
  fontWeight: 600,
  color: vars.color.textPrimary,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});
