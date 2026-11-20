import { style } from '@vanilla-extract/css';
import { vars } from '@/theme/vars.css';

export const shell = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '5px',
  marginTop: '8px',
  maxWidth: '432px',
  padding: '10px 12px 9px 14px',
  borderLeft: '4px solid transparent',
  borderRadius: '4px',
  backgroundColor: vars.color.bgSecondary,
  color: vars.color.textPrimary,
});

export const authorRow = style({
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  minWidth: 0,
});

export const authorIcon = style({
  width: '24px',
  height: '24px',
  flexShrink: 0,
  borderRadius: '50%',
  objectFit: 'cover',
  backgroundColor: vars.color.bgTertiary,
});

export const authorInitial = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '24px',
  height: '24px',
  flexShrink: 0,
  borderRadius: '50%',
  backgroundColor: vars.color.bgTertiary,
  color: vars.color.textSecondary,
  fontSize: '12px',
  fontWeight: 700,
});

export const authorText = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '0px',
  minWidth: 0,
});

export const authorNameRow = style({
  display: 'flex',
  alignItems: 'center',
  gap: '3px',
  minWidth: 0,
});

export const authorName = style({
  fontSize: '12px',
  fontWeight: 600,
  lineHeight: 1.3,
  color: vars.color.textSecondary,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  textDecoration: 'none',
});

export const authorMeta = style({
  fontSize: '11.5px',
  lineHeight: 1.3,
  color: vars.color.textMuted,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});

export const verified = style({
  flexShrink: 0,
  color: '#1d9bf0',
});

export const contentRow = style({
  display: 'flex',
  alignItems: 'flex-start',
  gap: '10px',
  minWidth: 0,
});

export const content = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '3px',
  flex: 1,
  minWidth: 0,
});

export const title = style({
  fontSize: '16px',
  fontWeight: 600,
  lineHeight: 1.25,
  color: vars.color.accent,
  textDecoration: 'none',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  display: '-webkit-box',
  WebkitLineClamp: 2,
  WebkitBoxOrient: 'vertical',
  overflowWrap: 'anywhere',
  ':hover': { textDecoration: 'underline' },
});

export const description = style({
  fontSize: '14px',
  lineHeight: 1.375,
  color: vars.color.textPrimary,
  whiteSpace: 'pre-wrap',
  overflowWrap: 'anywhere',
  overflow: 'hidden',
  display: '-webkit-box',
  WebkitLineClamp: 12,
  WebkitBoxOrient: 'vertical',
});

export const warning = style({
  padding: '4px 7px',
  borderRadius: '4px',
  backgroundColor: vars.color.bgTertiary,
  color: vars.color.textSecondary,
  fontSize: '12px',
  lineHeight: 1.4,
});

export const thumbnail = style({
  width: '80px',
  height: '80px',
  flexShrink: 0,
  borderRadius: '4px',
  objectFit: 'cover',
  backgroundColor: vars.color.bgTertiary,
});

export const fields = style({
  display: 'flex',
  flexWrap: 'wrap',
  gap: '4px 18px',
  marginTop: '2px',
});

export const field = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '1px',
  minWidth: '72px',
});

export const fieldName = style({
  fontSize: '12px',
  fontWeight: 600,
  lineHeight: 1.3,
  color: vars.color.textPrimary,
});

export const fieldValue = style({
  fontSize: '14px',
  lineHeight: 1.3,
  color: vars.color.textSecondary,
});

export const media = style({
  width: '100%',
  marginTop: '2px',
  borderRadius: '4px',
  overflow: 'hidden',
  backgroundColor: vars.color.bgTertiary,
});

export const mediaFrame = style({
  display: 'block',
  width: '100%',
  height: '100%',
  border: 'none',
});

export const mediaGrid = style({
  display: 'grid',
  gap: '2px',
  overflow: 'hidden',
  borderRadius: '4px',
  backgroundColor: vars.color.border,
});

export const mediaCell = style({
  display: 'block',
  overflow: 'hidden',
  backgroundColor: vars.color.bgTertiary,
});

export const photo = style({
  display: 'block',
  width: '100%',
  height: '100%',
  objectFit: 'cover',
});

export const video = style({
  position: 'relative',
  display: 'block',
  width: '100%',
  aspectRatio: '16 / 9',
  overflow: 'hidden',
  borderRadius: '4px',
  backgroundColor: vars.color.bgTertiary,
});

export const videoThumb = style({
  position: 'absolute',
  inset: 0,
  width: '100%',
  height: '100%',
  objectFit: 'cover',
});

export const videoPlay = style({
  position: 'absolute',
  top: '50%',
  left: '50%',
  transform: 'translate(-50%, -50%)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '52px',
  height: '52px',
  borderRadius: '50%',
  backgroundColor: 'rgba(23,23,23,0.82)',
  color: '#fff',
});

export const footer = style({
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '4px 10px',
  marginTop: '3px',
  fontSize: '12px',
  lineHeight: 1.35,
  color: vars.color.textMuted,
});

export const footerLeft = style({
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  gap: '4px 10px',
  minWidth: 0,
});

export const footerStats = style({
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  gap: '10px',
});

export const footerStat = style({
  display: 'inline-flex',
  alignItems: 'center',
  gap: '4px',
});

export const footerLink = style({
  flexShrink: 0,
  color: vars.color.textMuted,
  textDecoration: 'none',
  ':hover': { color: vars.color.textPrimary, textDecoration: 'underline' },
});
