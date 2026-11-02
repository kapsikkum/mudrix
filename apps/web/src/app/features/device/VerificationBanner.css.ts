import { style } from '@vanilla-extract/css';
import { vars } from '@/theme/vars.css';

export const banner = style({
  position: 'fixed',
  bottom: '80px',
  right: '20px',
  zIndex: 6000,
  backgroundColor: vars.color.bgSecondary,
  border: `1px solid ${vars.color.accent}`,
  borderRadius: vars.radius.md,
  padding: '12px 16px',
  display: 'flex',
  gap: '12px',
  alignItems: 'center',
  maxWidth: '380px',
});

export const icon = style({
  width: '36px',
  height: '36px',
  borderRadius: '50%',
  backgroundColor: vars.color.accent,
  color: '#fff',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
});

export const body = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '2px',
  flex: 1,
});

export const title = style({
  fontWeight: 600,
  fontSize: '0.9rem',
  color: vars.color.textPrimary,
});

export const text = style({
  fontSize: '0.82rem',
  color: vars.color.textMuted,
});

export const actions = style({
  display: 'flex',
  gap: '8px',
  marginTop: '8px',
});

const btn = style({
  padding: '5px 12px',
  borderRadius: vars.radius.sm,
  fontSize: '0.82rem',
  fontWeight: 500,
  cursor: 'pointer',
  border: 'none',
});

export const btnAccept = style([btn, { backgroundColor: vars.color.accent, color: '#fff' }]);
export const btnDecline = style([
  btn,
  {
    backgroundColor: vars.color.bgTertiary,
    color: vars.color.textPrimary,
  },
]);
