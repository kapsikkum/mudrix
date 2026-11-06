import { style } from '@vanilla-extract/css';
import { vars } from '@/theme/vars.css';
import { fast } from '@/theme/animations.css';

export const bioLink = style({
  color: vars.color.accent,
  textDecoration: 'none',
  selectors: {
    '&:hover': { textDecoration: 'underline' },
  },
});

export const timeValue = style({
  color: vars.color.textPrimary,
  fontWeight: 500,
});

export const timeOffset = style({
  color: vars.color.textMuted,
  marginLeft: '6px',
});

export const notesSection = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '6px',
});

export const notesLabel = style({
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
  fontSize: '0.75rem',
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.03em',
  color: vars.color.textMuted,
});

export const notesTextarea = style({
  width: '100%',
  minHeight: '60px',
  resize: 'vertical',
  padding: '8px 10px',
  borderRadius: vars.radius.sm,
  border: `1px solid ${vars.color.border}`,
  backgroundColor: vars.color.bgTertiary,
  color: vars.color.textPrimary,
  fontSize: '0.85rem',
  fontFamily: 'inherit',
  lineHeight: 1.4,
  selectors: {
    '&::placeholder': { color: vars.color.textMuted },
    '&:focus': { outline: 'none', borderColor: vars.color.accent },
  },
});

export const notesSaved = style({
  fontSize: '0.7rem',
  color: vars.color.textMuted,
  alignSelf: 'flex-end',
  opacity: 0,
  transition: `opacity ${fast}`,
  selectors: {
    '&[data-visible="true"]': { opacity: 1 },
  },
});

/** One labelled line of the card: an icon, then its value. */
export const detailRow = style({
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  fontSize: '0.85rem',
  color: vars.color.textSecondary,
});

export const detailIcon = style({
  display: 'inline-flex',
  color: vars.color.textMuted,
  flexShrink: 0,
});

export const pronouns = style({
  fontSize: '0.8rem',
  color: vars.color.textMuted,
});

export const body = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '12px',
  padding: '0 16px 14px',
});
