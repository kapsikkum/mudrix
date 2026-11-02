import { style } from '@vanilla-extract/css';
import { vars } from '@/theme/vars.css';
import { fast, slow } from '@/theme/animations.css';

export const container = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '4px',
  padding: '8px 0',
  maxWidth: '420px',
});

export const header = style({
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
  marginBottom: '8px',
});

export const icon = style({
  flexShrink: 0,
  color: vars.color.textMuted,
});

export const question = style({
  fontSize: '0.95rem',
  fontWeight: 600,
  color: vars.color.textPrimary,
  lineHeight: '1.4',
});

export const optionRow = style({
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  padding: '8px 10px',
  borderRadius: vars.radius.sm,
  cursor: 'pointer',
  position: 'relative',
  overflow: 'hidden',
  border: `1px solid ${vars.color.border}`,
  transition: `background-color ${fast}, border-color ${fast}`,
  ':hover': {
    backgroundColor: vars.color.bgHover,
  },
});

export const optionRowSelected = style({
  borderColor: vars.color.accent,
  backgroundColor: `${vars.color.accent}10`,
});

export const optionRowEnded = style({
  cursor: 'default',
});

export const progressBar = style({
  position: 'absolute',
  inset: 0,
  height: '100%',
  backgroundColor: `${vars.color.accent}12`,
  transition: `width ${slow} ease`,
  pointerEvents: 'none',
});

export const optionContent = style({
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  flex: 1,
  position: 'relative',
  zIndex: 1,
});

export const radioCircle = style({
  width: '18px',
  height: '18px',
  borderRadius: '50%',
  border: `2px solid ${vars.color.border}`,
  flexShrink: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  transition: `border-color ${fast}`,
});

export const radioCircleSelected = style({
  borderColor: vars.color.accent,
  '::after': {
    content: '""',
    width: '10px',
    height: '10px',
    borderRadius: '50%',
    backgroundColor: vars.color.accent,
  },
});

export const optionLabel = style({
  fontSize: '0.9rem',
  color: vars.color.textPrimary,
  flex: 1,
  lineHeight: '1.3',
});

export const voteCount = style({
  fontSize: '0.78rem',
  color: vars.color.textMuted,
  whiteSpace: 'nowrap',
});

export const footer = style({
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
  fontSize: '0.78rem',
  color: vars.color.textMuted,
  marginTop: '4px',
  padding: '0 2px',
});

export const endedBadge = style({
  fontSize: '0.72rem',
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  color: vars.color.danger,
});

export const loadingText = style({
  fontSize: '0.85rem',
  color: vars.color.textMuted,
  opacity: 0.7,
});
