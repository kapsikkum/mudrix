import { style } from '@vanilla-extract/css';
import { vars } from '@/theme/vars.css';
import { fast } from '@/theme/animations.css';
import { TITLE_BAR_HEIGHT } from '@/app/components/TitleBar/TitleBar.css';

export const page = style({
  position: 'fixed',
  inset: 0,
  zIndex: 7500,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '24px',
  backgroundColor: vars.color.bgPrimary,
  overflowY: 'auto',
  selectors: {
    'html.electron &': {
      paddingTop: `${24 + TITLE_BAR_HEIGHT}px`,
    },
  },
});

export const card = style({
  width: '100%',
  maxWidth: '420px',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: '12px',
  padding: '40px 32px 24px',
  backgroundColor: vars.color.bgSecondary,
  border: `1px solid ${vars.color.border}`,
  borderRadius: vars.radius.md,
});

export const iconCircle = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '64px',
  height: '64px',
  marginBottom: '4px',
  borderRadius: '50%',
  color: vars.color.accent,
  backgroundColor: `color-mix(in srgb, ${vars.color.accent} 15%, transparent)`,
});

export const title = style({
  margin: 0,
  fontSize: '1.4rem',
  fontWeight: 700,
  color: vars.color.textPrimary,
  textAlign: 'center',
});

export const body = style({
  margin: 0,
  fontSize: '0.92rem',
  lineHeight: 1.5,
  color: vars.color.textMuted,
  textAlign: 'center',
});

export const actions = style({
  width: '100%',
  display: 'flex',
  flexDirection: 'column',
  gap: '10px',
  marginTop: '12px',
});

const linkBase = style({
  border: 'none',
  background: 'none',
  padding: '4px',
  cursor: 'pointer',
  fontSize: '0.85rem',
  transition: `color ${fast}`,
  ':disabled': { opacity: 0.5, cursor: 'not-allowed' },
});

export const resetLink = style([
  linkBase,
  {
    alignSelf: 'center',
    color: vars.color.danger,
    ':hover': { textDecoration: 'underline' },
  },
]);

export const footer = style({
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
  marginTop: '16px',
  fontSize: '0.78rem',
  color: vars.color.textMuted,
});

export const footerLink = style([
  linkBase,
  {
    fontSize: '0.78rem',
    color: vars.color.textMuted,
    ':hover': { color: vars.color.textPrimary },
  },
]);
