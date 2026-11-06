import { style, globalStyle } from '@vanilla-extract/css';
import { vars } from '@/theme/vars.css';

export const card = style({
  display: 'flex',
  flexDirection: 'column',
  marginTop: '8px',
  borderRadius: vars.radius.md,
  border: `1px solid ${vars.color.border}`,
  backgroundColor: vars.color.bgSecondary,
  overflow: 'hidden',
  maxWidth: '360px',
  textDecoration: 'none',
  color: 'inherit',
  ':hover': {
    backgroundColor: vars.color.bgHover,
  },
});

export const image = style({
  width: '100%',
  maxHeight: '180px',
  objectFit: 'cover',
  display: 'block',
  backgroundColor: vars.color.bgTertiary,
});

export const body = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '3px',
  padding: '8px 10px',
  minWidth: 0,
});

export const title = style({
  fontSize: '13px',
  fontWeight: 600,
  color: vars.color.textPrimary,
  textDecoration: 'none',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  display: '-webkit-box',
  WebkitLineClamp: 2,
  WebkitBoxOrient: 'vertical',
  lineHeight: '1.35',
  ':hover': {
    textDecoration: 'none',
  },
});

export const description = style({
  fontSize: '12px',
  color: vars.color.textSecondary,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  display: '-webkit-box',
  WebkitLineClamp: 2,
  WebkitBoxOrient: 'vertical',
  lineHeight: '1.4',
});

export const siteName = style({
  fontSize: '11px',
  color: vars.color.textMuted,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  marginTop: '2px',
});

globalStyle(`${card} a`, {
  textDecoration: 'none',
});
globalStyle(`${card} a:hover`, {
  textDecoration: 'none',
});

export const ytCard = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '6px',
  marginTop: '8px',
  padding: '10px 12px 12px',
  maxWidth: '432px',
  borderRadius: vars.radius.md,
  border: `1px solid ${vars.color.border}`,
  borderLeft: '4px solid #ff0000',
  backgroundColor: vars.color.bgSecondary,
});

export const ytPromptCard = style({
  maxWidth: '360px',
  gap: '8px',
  padding: '8px 12px 10px',
});

export const ytProvider = style({
  fontSize: '12px',
  color: vars.color.textMuted,
});

export const ytChannel = style({
  fontSize: '14px',
  fontWeight: 700,
  color: vars.color.textPrimary,
});

export const ytTitle = style({
  fontSize: '15px',
  fontWeight: 600,
  lineHeight: 1.3,
  color: vars.color.accent,
  textDecoration: 'none',
  overflowWrap: 'anywhere',
  ':hover': { textDecoration: 'underline' },
});

export const ytPromptText = style({
  fontSize: '12px',
  lineHeight: 1.4,
  color: vars.color.textSecondary,
});

export const ytPromptActions = style({
  display: 'flex',
  flexWrap: 'wrap',
  gap: '6px',
});

export const ytPlayer = style({
  position: 'relative',
  width: '100%',
  aspectRatio: '16 / 9',
  marginTop: '4px',
  borderRadius: vars.radius.sm,
  backgroundColor: vars.color.bgTertiary,
  overflow: 'hidden',
});

export const ytThumb = style({
  position: 'absolute',
  inset: 0,
  width: '100%',
  height: '100%',
  objectFit: 'cover',
});

export const ytFrame = style({
  position: 'absolute',
  inset: 0,
  width: '100%',
  height: '100%',
  border: 'none',
});

export const ytPlay = style({
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
  ':hover': { backgroundColor: '#ff0000' },
});

export const ytBtn = style({
  padding: '5px 12px',
  borderRadius: vars.radius.sm,
  border: `1px solid ${vars.color.border}`,
  backgroundColor: 'transparent',
  color: vars.color.textPrimary,
  fontSize: '12px',
  cursor: 'pointer',
  ':hover': { backgroundColor: vars.color.bgHover },
});

export const ytBtnPrimary = style([
  ytBtn,
  { backgroundColor: vars.color.accent, borderColor: 'transparent', color: '#fff' },
]);
