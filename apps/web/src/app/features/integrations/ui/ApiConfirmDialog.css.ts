import { style } from '@vanilla-extract/css';
import { vars } from '@/theme/vars.css';
import { fontSize } from '@/theme/typeScale';

export const body = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '12px',
});

export const facts = style({
  display: 'grid',
  gridTemplateColumns: 'max-content minmax(0, 1fr)',
  columnGap: '12px',
  rowGap: '4px',
  margin: 0,
  fontSize: fontSize.sm,
});

export const factLabel = style({
  color: vars.color.textMuted,
  margin: 0,
});

export const factValue = style({
  color: vars.color.textPrimary,
  margin: 0,
  fontFamily: 'monospace',
  overflowWrap: 'anywhere',
});

export const sectionLabel = style({
  fontSize: fontSize.sm,
  fontWeight: 600,
  color: vars.color.textPrimary,
});

export const preview = style({
  margin: 0,
  padding: '10px 12px',
  maxHeight: '240px',
  overflow: 'auto',
  fontFamily: 'monospace',
  fontSize: fontSize.sm,
  lineHeight: 1.5,
  color: vars.color.textPrimary,
  backgroundColor: vars.color.bgInput,
  border: `1px solid ${vars.color.border}`,
  borderRadius: vars.radius.sm,
  whiteSpace: 'pre-wrap',
  overflowWrap: 'anywhere',
  ':focus-visible': { outline: `2px solid ${vars.color.accent}`, outlineOffset: '2px' },
});

export const note = style({
  margin: 0,
  fontSize: fontSize.sm,
  color: vars.color.textMuted,
  lineHeight: 1.5,
});

export const errorText = style({
  fontSize: fontSize.sm,
  color: vars.color.error,
  overflowWrap: 'anywhere',
});
