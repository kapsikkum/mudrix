import { style } from '@vanilla-extract/css';
import { vars } from '@/theme/vars.css';
import { fontSize } from '@/theme/typeScale';

export const backdrop = style({
  position: 'absolute',
  inset: 0,
  zIndex: 70,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '16px',
  backgroundColor: 'rgba(0, 0, 0, 0.6)',
  backdropFilter: 'blur(6px)',
});

export const card = style({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: '12px',
  width: 'min(340px, 100%)',
  padding: '24px 24px 20px',
  borderRadius: vars.radius.lg,
  border: `1px solid ${vars.color.border}`,
  backgroundColor: vars.color.bgSecondary,
  boxShadow: '0 16px 40px rgba(0, 0, 0, 0.45)',
  textAlign: 'center',
});

export const floatingCard = style([
  card,
  {
    position: 'fixed',
    left: '50%',
    bottom: '24px',
    transform: 'translateX(-50%)',
    zIndex: 9000,
  },
]);

export const copy = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '4px',
});

export const title = style({
  color: vars.color.textPrimary,
  fontSize: fontSize.md,
  fontWeight: 600,
});

export const subtitle = style({
  color: vars.color.textMuted,
  fontSize: fontSize.sm,
  fontVariantNumeric: 'tabular-nums',
});

export const actions = style({
  display: 'flex',
  gap: '8px',
  width: '100%',
  justifyContent: 'center',
});
