import { style } from '@vanilla-extract/css';
import { vars } from '@/theme/vars.css';
import { fast } from '@/theme/animations.css';

const noDrag = { WebkitAppRegion: 'no-drag' } as Record<string, string>;

export const backdrop = style({
  ...noDrag,
  position: 'fixed',
  inset: 0,
  zIndex: 9000,
});

export const panel = style({
  ...noDrag,
  position: 'fixed',
  zIndex: 9001,
  display: 'flex',
  flexDirection: 'column',
  maxHeight: 'min(560px, calc(100vh - 24px))',
  backgroundColor: vars.color.bgSecondary,
  border: `1px solid ${vars.color.border}`,
  borderRadius: vars.radius.md,
  boxShadow: '0 12px 32px rgba(0, 0, 0, 0.35)',
  overflow: 'hidden',
});

export const inputRow = style({
  padding: '6px',
  flexShrink: 0,
});

export const inputField = style({
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  height: '32px',
  padding: '0 8px 0 10px',
  borderRadius: vars.radius.md,
  border: `1px solid ${vars.color.accent}`,
  backgroundColor: vars.color.bgPrimary,
  color: vars.color.textMuted,
});

export const input = style({
  flex: 1,
  minWidth: 0,
  border: 'none',
  background: 'none',
  outline: 'none',
  color: vars.color.textPrimary,
  fontSize: '0.88rem',
  '::placeholder': { color: vars.color.textMuted },
});

export const body = style({
  flex: 1,
  minHeight: 0,
  overflowY: 'auto',
  padding: '0 6px 6px',
});

export const section = style({
  paddingTop: '6px',
  selectors: {
    '& + &': {
      marginTop: '4px',
      borderTop: `1px solid ${vars.color.border}`,
    },
  },
});

export const sectionTitle = style({
  padding: '6px 8px 4px',
  fontSize: '0.75rem',
  fontWeight: 700,
  color: vars.color.textPrimary,
});

export const item = style({
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
  minHeight: '32px',
  padding: '4px 8px',
  borderRadius: vars.radius.sm,
  cursor: 'pointer',
  userSelect: 'none',
  color: vars.color.textPrimary,
  fontSize: '0.88rem',
  transition: `background-color ${fast}`,
  selectors: {
    '&[data-highlighted="true"]': { backgroundColor: vars.color.bgHover },
  },
});

export const itemIcon = style({
  width: '24px',
  flexShrink: 0,
  display: 'flex',
  justifyContent: 'center',
  color: vars.color.textMuted,
});

export const itemText = style({
  flex: 1,
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});

export const itemMeta = style({
  color: vars.color.textMuted,
  fontSize: '0.8rem',
});

export const messageItem = style([item, { alignItems: 'flex-start', paddingTop: '6px' }]);

export const messageBody = style({
  flex: 1,
  minWidth: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: '1px',
});

export const messageHead = style({
  display: 'flex',
  alignItems: 'baseline',
  gap: '8px',
});

export const messageSender = style({
  fontWeight: 600,
  fontSize: '0.82rem',
});

export const messageTime = style({
  marginLeft: 'auto',
  flexShrink: 0,
  color: vars.color.textMuted,
  fontSize: '0.72rem',
});

export const messageSnippet = style({
  color: vars.color.textSecondary,
  fontSize: '0.84rem',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});

export const sectionEmpty = style({
  padding: '6px 8px 8px',
  color: vars.color.textMuted,
  fontSize: '0.82rem',
});

export const footer = style({
  display: 'flex',
  alignItems: 'center',
  flexWrap: 'wrap',
  gap: '14px',
  padding: '6px 12px',
  borderTop: `1px solid ${vars.color.border}`,
  color: vars.color.textMuted,
  fontSize: '0.72rem',
  flexShrink: 0,
});

export const footerHint = style({
  display: 'inline-flex',
  alignItems: 'center',
  gap: '4px',
});

export const badge = style({
  flexShrink: 0,
  minWidth: '18px',
  padding: '1px 6px',
  borderRadius: '10px',
  backgroundColor: vars.color.accent,
  color: '#fff',
  fontSize: '0.72rem',
  fontWeight: 700,
  textAlign: 'center',
});

export const badgeMention = style([badge, { backgroundColor: vars.color.mention }]);
