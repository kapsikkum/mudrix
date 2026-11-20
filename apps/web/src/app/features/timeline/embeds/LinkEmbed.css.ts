import { style } from '@vanilla-extract/css';
import { vars } from '@/theme/vars.css';

export const card = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '6px',
  marginTop: '8px',
  padding: '10px 12px 12px',
  maxWidth: '432px',
  borderRadius: vars.radius.md,
  border: `1px solid ${vars.color.border}`,
  borderLeftWidth: '4px',
  borderLeftStyle: 'solid',
  backgroundColor: vars.color.bgSecondary,
});

export const promptCard = style({
  maxWidth: '360px',
  gap: '8px',
  padding: '8px 12px 10px',
});

export const provider = style({
  fontSize: '12px',
  color: vars.color.textMuted,
});

export const author = style({
  fontSize: '14px',
  fontWeight: 700,
  color: vars.color.textPrimary,
});

export const title = style({
  fontSize: '15px',
  fontWeight: 600,
  lineHeight: 1.3,
  color: vars.color.accent,
  textDecoration: 'none',
  overflowWrap: 'anywhere',
  ':hover': { textDecoration: 'underline' },
});

export const description = style({
  fontSize: '12px',
  lineHeight: 1.4,
  color: vars.color.textSecondary,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  display: '-webkit-box',
  WebkitLineClamp: 3,
  WebkitBoxOrient: 'vertical',
});

export const player = style({
  position: 'relative',
  width: '100%',
  marginTop: '4px',
  borderRadius: vars.radius.sm,
  backgroundColor: vars.color.bgTertiary,
  overflow: 'hidden',
});

export const cardImage = style({
  display: 'block',
  width: '100%',
  maxHeight: '200px',
  objectFit: 'cover',
  borderRadius: vars.radius.sm,
  backgroundColor: vars.color.bgTertiary,
});

export const thumb = style({
  position: 'absolute',
  inset: 0,
  width: '100%',
  height: '100%',
  objectFit: 'cover',
});

export const frame = style({
  position: 'absolute',
  inset: 0,
  width: '100%',
  height: '100%',
  border: 'none',
});

export const play = style({
  position: 'absolute',
  top: '50%',
  left: '50%',
  transform: 'translate(-50%, -50%)',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '72px',
  height: '48px',
  borderRadius: '24px',
  border: 'none',
  backgroundColor: 'rgba(23,23,23,0.8)',
  color: '#fff',
  cursor: 'pointer',
  transition: 'background-color 120ms',
  ':hover': { backgroundColor: 'rgba(23,23,23,0.95)' },
});

export const promptText = style({
  fontSize: '12px',
  lineHeight: 1.4,
  color: vars.color.textSecondary,
});

export const promptActions = style({
  display: 'flex',
  flexWrap: 'wrap',
  gap: '6px',
});

export const btn = style({
  padding: '5px 12px',
  borderRadius: vars.radius.sm,
  border: `1px solid ${vars.color.border}`,
  backgroundColor: 'transparent',
  color: vars.color.textPrimary,
  fontSize: '12px',
  cursor: 'pointer',
  ':hover': { backgroundColor: vars.color.bgHover },
});

export const btnPrimary = style([
  btn,
  { backgroundColor: vars.color.accent, borderColor: 'transparent', color: '#fff' },
]);

export const openLink = style({
  display: 'inline-flex',
  alignItems: 'center',
  gap: '5px',
  alignSelf: 'flex-start',
  marginTop: '2px',
  fontSize: '12px',
  color: vars.color.textSecondary,
  textDecoration: 'none',
  ':hover': { color: vars.color.textPrimary, textDecoration: 'underline' },
});
