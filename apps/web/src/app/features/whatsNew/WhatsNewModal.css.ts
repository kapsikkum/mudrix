import { globalStyle, style } from '@vanilla-extract/css';
import { vars } from '@/theme/vars.css';
import { fast } from '@/theme/animations.css';

export const scroll = style({
  padding: '16px 20px 20px',
  gap: '16px',
});

export const body = style({
  fontSize: '0.95rem',
  lineHeight: 1.5,
  color: vars.color.textPrimary,
  overflowWrap: 'anywhere',
});

globalStyle(`${body} h1, ${body} h2, ${body} h3`, {
  display: 'flex',
  alignItems: 'center',
  gap: '12px',
  margin: '24px 0 8px',
  fontSize: '1rem',
  fontWeight: 700,
  color: vars.color.accent,
});

globalStyle(`${body} h1::after, ${body} h2::after, ${body} h3::after`, {
  content: '""',
  flex: 1,
  minWidth: '24px',
  height: '1px',
  backgroundColor: vars.color.border,
});

globalStyle(`${body} > :first-child`, { marginTop: 0 });

globalStyle(`${body} > :last-child`, { marginBottom: 0 });

globalStyle(`${body} p`, { margin: '0 0 12px' });

globalStyle(`${body} ul, ${body} ol`, {
  margin: '0 0 12px',
  paddingLeft: '1.25em',
});

globalStyle(`${body} li`, { marginBottom: '6px', paddingLeft: '2px' });

globalStyle(`${body} li::marker`, { color: vars.color.textMuted });

globalStyle(`${body} strong`, { fontWeight: 700 });

globalStyle(`${body} a`, {
  color: vars.color.link,
  textDecoration: 'none',
  cursor: 'pointer',
});

globalStyle(`${body} a:hover`, { textDecoration: 'underline' });

globalStyle(`${body} img`, {
  maxWidth: '100%',
  borderRadius: vars.radius.md,
});

globalStyle(`${body} code`, {
  fontSize: '0.85em',
  padding: '1px 4px',
  borderRadius: vars.radius.sm,
  backgroundColor: vars.color.bgTertiary,
});

export const changelogLink = style({
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px',
  marginLeft: 'auto',
  fontSize: '0.85rem',
  color: vars.color.textMuted,
  textDecoration: 'none',
  transition: `color ${fast}`,
  ':hover': { color: vars.color.textPrimary },
});

export const footer = style({
  justifyContent: 'flex-start',
  alignItems: 'center',
  flexWrap: 'wrap',
  gap: '12px',
  padding: '14px 20px',
  borderTop: `1px solid ${vars.color.border}`,
});

export const socials = style({
  display: 'flex',
  alignItems: 'center',
  gap: '4px',
});

export const social = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '30px',
  height: '30px',
  borderRadius: vars.radius.sm,
  color: vars.color.textMuted,
  transition: `color ${fast}, background-color ${fast}`,
  ':hover': { color: vars.color.textPrimary, backgroundColor: vars.color.bgHover },
});
