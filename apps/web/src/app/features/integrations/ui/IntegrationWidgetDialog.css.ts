import { style } from '@vanilla-extract/css';
import { vars } from '@/theme/vars.css';
import { fontSize } from '@/theme/typeScale';

/** The iframe fills the dialog body edge to edge. */
export const dialogBody = style({
  padding: 0,
  gap: 0,
  overflowY: 'hidden',
});

export const notice = style({
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  padding: '8px 16px',
  fontSize: fontSize.rem82,
  color: vars.color.textMuted,
  borderBottom: `1px solid ${vars.color.border}`,
  flexShrink: 0,
  overflowWrap: 'anywhere',
});

export const codeBadge = style({
  flexShrink: 0,
  padding: '1px 6px',
  borderRadius: vars.radius.sm,
  border: `1px solid ${vars.color.warning}`,
  color: vars.color.warning,
  fontSize: fontSize.rem75,
  fontWeight: 600,
});

export const frameWrap = style({
  position: 'relative',
  flex: 1,
  minHeight: 0,
  display: 'flex',
});

export const iframe = style({
  flex: 1,
  width: '100%',
  height: '100%',
  minHeight: '360px',
  border: 'none',
  backgroundColor: vars.color.bgPrimary,
});

export const loading = style({
  position: 'absolute',
  inset: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '8px',
  color: vars.color.textMuted,
  fontSize: fontSize.rem90,
  pointerEvents: 'none',
});

export const errorState = style({
  padding: '24px',
  color: vars.color.error,
  fontSize: fontSize.rem90,
  lineHeight: 1.5,
  overflowWrap: 'anywhere',
});
