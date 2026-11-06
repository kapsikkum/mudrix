import { style } from '@vanilla-extract/css';
import { vars } from '@/theme/vars.css';

/** Cards for what someone is playing or listening to, under their name on the profile. */

export const cards = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '8px',
  width: '100%',
  boxSizing: 'border-box',
  padding: '0 0 12px',
});

export const card = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '8px',
  padding: '10px 12px',
  borderRadius: vars.radius.md,
  backgroundColor: `color-mix(in srgb, var(--card-accent, ${vars.color.accent}) 9%, ${vars.color.bgSecondary})`,
  border: `1px solid color-mix(in srgb, var(--card-accent, ${vars.color.accent}) 22%, ${vars.color.border})`,
});

export const heading = style({
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
  fontSize: '0.7rem',
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  color: vars.color.textMuted,
  selectors: {
    // A small accent dot before the label.
    '&::before': {
      content: '""',
      width: '6px',
      height: '6px',
      borderRadius: '50%',
      backgroundColor: `var(--card-accent, ${vars.color.accent})`,
    },
  },
});

export const body = style({
  display: 'flex',
  alignItems: 'flex-start',
  gap: '10px',
});

export const icon = style({
  flexShrink: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '40px',
  height: '40px',
  borderRadius: vars.radius.sm,
  fontSize: '1.4rem',
  lineHeight: 1,
  backgroundColor: `color-mix(in srgb, var(--card-accent, ${vars.color.accent}) 26%, ${vars.color.bgSecondary})`,
});

export const text = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '1px',
  minWidth: 0,
});

// Wrapped, never cut off: the whole point of the card is to read the full title.
export const title = style({
  fontSize: '0.92rem',
  fontWeight: 600,
  color: vars.color.textPrimary,
  overflowWrap: 'anywhere',
});

export const detail = style({
  fontSize: '0.82rem',
  color: vars.color.textSecondary,
  overflowWrap: 'anywhere',
});

export const meta = style({
  fontSize: '0.78rem',
  color: vars.color.textMuted,
});
