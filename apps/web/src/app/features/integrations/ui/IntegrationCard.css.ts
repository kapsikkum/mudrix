import { style } from '@vanilla-extract/css';
import { vars } from '@/theme/vars.css';

export const card = style({
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
  marginTop: '8px',
  padding: '8px 10px',
  maxWidth: '360px',
  borderRadius: vars.radius.md,
  border: `1px solid ${vars.color.border}`,
  backgroundColor: vars.color.bgSecondary,
});

export const icon = style({
  width: '32px',
  height: '32px',
  flexShrink: 0,
  borderRadius: vars.radius.md,
  objectFit: 'cover',
});

export const text = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '2px',
  minWidth: 0,
  flex: 1,
});

export const title = style({
  fontSize: '13px',
  fontWeight: 600,
  color: vars.color.textPrimary,
  overflowWrap: 'anywhere',
});

export const subtitle = style({
  fontSize: '12px',
  color: vars.color.textSecondary,
  overflowWrap: 'anywhere',
});

export const via = style({
  fontSize: '12px',
  color: vars.color.textMuted,
});

export const button = style({
  flexShrink: 0,
  padding: '4px 10px',
  borderRadius: vars.radius.md,
  border: `1px solid ${vars.color.border}`,
  fontSize: '12px',
  color: vars.color.accent,
  textDecoration: 'none',
  ':hover': { backgroundColor: vars.color.bgHover },
});

/** A card with a button that opens the page in a window: stacked, with the details above. */
export const cardRich = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '8px',
  marginTop: '8px',
  padding: '10px 12px',
  maxWidth: '380px',
  borderRadius: vars.radius.md,
  border: `1px solid ${vars.color.border}`,
  backgroundColor: vars.color.bgSecondary,
});

export const richHeader = style({
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
});

export const linkLine = style({
  fontFamily: 'monospace',
  fontSize: '12px',
  color: vars.color.textSecondary,
  padding: '4px 8px',
  borderRadius: vars.radius.md,
  backgroundColor: vars.color.bgPrimary,
  overflowWrap: 'anywhere',
});

export const note = style({
  fontSize: '12px',
  color: vars.color.textMuted,
});

/** Looked-up description: at most three lines. */
export const description = style({
  fontSize: '12px',
  color: vars.color.textPrimary,
  overflowWrap: 'anywhere',
  display: '-webkit-box',
  WebkitLineClamp: 3,
  WebkitBoxOrient: 'vertical',
  overflow: 'hidden',
});

export const facts = style({
  display: 'flex',
  flexWrap: 'wrap',
  gap: '4px 12px',
  fontSize: '12px',
  color: vars.color.textPrimary,
});

export const fact = style({
  overflowWrap: 'anywhere',
});

export const factLabel = style({
  color: vars.color.textMuted,
});

export const askButton = style({
  alignSelf: 'flex-start',
  padding: 0,
  border: 'none',
  background: 'none',
  cursor: 'pointer',
  fontSize: '12px',
  color: vars.color.accent,
  textAlign: 'left',
  ':hover': { textDecoration: 'underline' },
});

export const actions = style({
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  gap: '8px',
});
