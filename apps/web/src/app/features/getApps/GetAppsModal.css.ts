import { style } from '@vanilla-extract/css';
import { vars } from '@/theme/vars.css';
import { fontSize } from '@/theme/typeScale';

export const body = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '24px',
  overflowY: 'auto',
});

export const section = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '12px',
});

export const sectionTitle = style({
  margin: 0,
  fontSize: fontSize.xs,
  fontWeight: 600,
  color: vars.color.textMuted,
});

export const grid = style({
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
  gap: '12px',
});

export const card = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '12px',
  padding: '16px',
  borderRadius: vars.radius.md,
  border: `1px solid ${vars.color.border}`,
  backgroundColor: vars.color.bgTertiary,
});

export const cardCurrent = style([
  card,
  {
    borderColor: vars.color.accent,
  },
]);

export const cardHeader = style({
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
});

export const platformIcon = style({
  flexShrink: 0,
  color: vars.color.textPrimary,
});

export const platformName = style({
  fontWeight: 600,
  color: vars.color.textPrimary,
});

export const badge = style({
  marginLeft: 'auto',
  padding: '2px 8px',
  borderRadius: '999px',
  backgroundColor: vars.color.accent,
  color: vars.color.onAccent,
  fontSize: fontSize.xs,
  fontWeight: 600,
  whiteSpace: 'nowrap',
});

export const badgeMuted = style([
  badge,
  {
    backgroundColor: vars.color.bgActive,
    color: vars.color.textMuted,
  },
]);

export const note = style({
  margin: 0,
  fontSize: fontSize.sm,
  lineHeight: 1.4,
  color: vars.color.textMuted,
});

export const actions = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '8px',
  marginTop: 'auto',
});

export const button = style({
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '8px',
  padding: '8px 16px',
  borderRadius: vars.radius.sm,
  border: `1px solid ${vars.color.border}`,
  backgroundColor: vars.color.bgSecondary,
  color: vars.color.textPrimary,
  fontSize: fontSize.sm,
  fontWeight: 500,
  textDecoration: 'none',
  selectors: {
    '&:hover': {
      backgroundColor: vars.color.bgHover,
    },
  },
});

export const buttonPrimary = style([
  button,
  {
    borderColor: vars.color.accent,
    backgroundColor: vars.color.accent,
    color: vars.color.onAccent,
    selectors: {
      '&:hover': {
        backgroundColor: vars.color.accentHover,
        borderColor: vars.color.accentHover,
      },
    },
  },
]);

export const menu = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '2px',
  minWidth: '180px',
});

export const menuItem = style({
  display: 'block',
  padding: '8px 10px',
  borderRadius: vars.radius.sm,
  color: vars.color.textPrimary,
  fontSize: fontSize.sm,
  textDecoration: 'none',
  selectors: {
    '&:hover, &:focus-visible': {
      backgroundColor: vars.color.bgHover,
    },
  },
});

export const installed = style({
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px',
  padding: '8px 0',
  fontSize: fontSize.sm,
  color: vars.color.success,
});

export const link = style({
  fontSize: fontSize.xs,
  color: vars.color.link,
  textDecoration: 'none',
  selectors: {
    '&:hover': {
      textDecoration: 'underline',
    },
  },
});

export const footer = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'flex-end',
  gap: '12px',
  fontSize: fontSize.xs,
  color: vars.color.textMuted,
});
