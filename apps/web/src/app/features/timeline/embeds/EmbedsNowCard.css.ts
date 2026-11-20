import { keyframes, style } from '@vanilla-extract/css';
import { vars } from '@/theme/vars.css';

export const body = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '6px',
  minWidth: 0,
});

export const textRow = style({
  display: 'flex',
  alignItems: 'flex-start',
  gap: '10px',
  minWidth: 0,
});

export const text = style({
  flex: 1,
  minWidth: 0,
  fontSize: '14px',
  lineHeight: 1.375,
  color: vars.color.textPrimary,
  overflowWrap: 'anywhere',
});

export const line = style({
  margin: 0,
  whiteSpace: 'pre-wrap',
  minHeight: '0.5em',
});

export const small = style({
  fontSize: '12px',
  lineHeight: 1.4,
  color: vars.color.textMuted,
});

export const bold = style({ fontWeight: 700 });

export const link = style({
  color: vars.color.accent,
  textDecoration: 'none',
  ':hover': { textDecoration: 'underline' },
});

export const avatar = style({
  width: '48px',
  height: '48px',
  flexShrink: 0,
  borderRadius: '50%',
  objectFit: 'cover',
  backgroundColor: vars.color.bgTertiary,
});

export const gallery = style({
  display: 'grid',
  gridTemplateColumns: 'repeat(6, minmax(0, 1fr))',
  gap: '2px',
  overflow: 'hidden',
  borderRadius: '4px',
  backgroundColor: vars.color.border,
});

export const cell = style({
  position: 'relative',
  display: 'block',
  padding: 0,
  border: 'none',
  overflow: 'hidden',
  backgroundColor: vars.color.bgTertiary,
  cursor: 'zoom-in',
  minWidth: 0,
  ':focus-visible': { outline: `2px solid ${vars.color.accent}`, outlineOffset: '-2px' },
});

export const cellSquare = style({ aspectRatio: '1 / 1' });
export const cellWide = style({ aspectRatio: '16 / 9' });
export const cellSingle = style({ maxHeight: '400px', cursor: 'zoom-in' });

export const picture = style({
  display: 'block',
  width: '100%',
  height: '100%',
  objectFit: 'cover',
});

export const pictureSingle = style({
  display: 'block',
  width: '100%',
  maxHeight: '400px',
  objectFit: 'contain',
  backgroundColor: vars.color.bgTertiary,
});

export const more = style({
  position: 'absolute',
  inset: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  backgroundColor: vars.scrim.deep,
  color: '#fff',
  fontSize: '20px',
  fontWeight: 600,
});

export const video = style({
  display: 'block',
  width: '100%',
  maxHeight: '420px',
  borderRadius: '4px',
  backgroundColor: '#000',
});

export const audio = style({
  display: 'block',
  width: '100%',
});

export const separator = style({
  height: '1px',
  margin: '2px 0',
  backgroundColor: vars.color.border,
});

export const buttons = style({
  display: 'flex',
  flexWrap: 'wrap',
  gap: '6px',
});

export const button = style({
  display: 'inline-flex',
  alignItems: 'center',
  padding: '5px 12px',
  borderRadius: vars.radius.sm,
  border: `1px solid ${vars.color.border}`,
  backgroundColor: vars.color.bgTertiary,
  color: vars.color.textPrimary,
  fontSize: '13px',
  fontWeight: 500,
  textDecoration: 'none',
  ':hover': { backgroundColor: vars.color.bgHover },
  ':focus-visible': { outline: `2px solid ${vars.color.accent}`, outlineOffset: '1px' },
});

export const via = style({
  fontSize: '11.5px',
  color: vars.color.textMuted,
});

export const status = style({
  fontSize: '13px',
  color: vars.color.textMuted,
});

const pulse = keyframes({
  '0%, 100%': { opacity: 0.55 },
  '50%': { opacity: 1 },
});

export const skeleton = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '8px',
  animation: `${pulse} 1.6s ease-in-out infinite`,
  '@media': { '(prefers-reduced-motion: reduce)': { animation: 'none' } },
});

export const skeletonBar = style({
  height: '12px',
  borderRadius: '3px',
  backgroundColor: vars.color.bgTertiary,
});

export const skeletonMedia = style({
  height: '140px',
  borderRadius: '4px',
  backgroundColor: vars.color.bgTertiary,
});

export const retry = style({
  alignSelf: 'flex-start',
  padding: 0,
  border: 'none',
  background: 'none',
  color: vars.color.accent,
  fontSize: '12px',
  cursor: 'pointer',
  ':hover': { textDecoration: 'underline' },
});
