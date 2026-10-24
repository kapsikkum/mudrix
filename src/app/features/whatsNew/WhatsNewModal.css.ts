import { globalStyle, style } from '@vanilla-extract/css';
import { vars } from '@/theme/vars.css';
import { fast } from '@/theme/animations.css';

export const body = style({
  fontSize: '0.92rem',
  lineHeight: 1.55,
  color: vars.color.textPrimary,
});

globalStyle(`${body} h2, ${body} h3`, {
  margin: '18px 0 6px',
  fontSize: '0.95rem',
  fontWeight: 700,
  color: vars.color.accent,
});

globalStyle(`${body} > :first-child`, { marginTop: 0 });

globalStyle(`${body} p`, { margin: '0 0 10px' });

globalStyle(`${body} ul`, {
  margin: '0 0 10px',
  paddingLeft: 0,
  listStylePosition: 'inside',
});

globalStyle(`${body} li`, { marginBottom: '6px' });

globalStyle(`${body} li::marker`, { color: vars.color.textMuted });

globalStyle(`${body} a`, {
  color: vars.color.textPrimary,
  textDecoration: 'underline',
  textDecorationColor: vars.color.textMuted,
  textUnderlineOffset: '2px',
  cursor: 'pointer',
  transition: `text-decoration-color ${fast}`,
});

globalStyle(`${body} a:hover`, { textDecorationColor: vars.color.textPrimary });

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
  marginRight: 'auto',
  fontSize: '0.82rem',
  color: vars.color.textMuted,
  textDecoration: 'none',
  transition: `color ${fast}`,
  ':hover': { color: vars.color.textPrimary },
});
