import { style } from '@vanilla-extract/css';
import { vars } from '@/theme/vars.css';

export const wrap = style({
  position: 'relative',
  flex: 1,
  minWidth: 0,
  display: 'flex',
  alignItems: 'center',
});

export const bubble = style({
  position: 'absolute',
  bottom: 'calc(100% + 6px)',
  transform: 'translateX(-50%)',
  padding: '3px 7px',
  borderRadius: vars.radius.sm,
  backgroundColor: vars.color.bgTertiary,
  border: `1px solid ${vars.color.border}`,
  boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
  color: vars.color.textPrimary,
  fontSize: '0.75rem',
  fontWeight: 600,
  fontVariantNumeric: 'tabular-nums',
  whiteSpace: 'nowrap',
  pointerEvents: 'none',
  zIndex: 2,
});
