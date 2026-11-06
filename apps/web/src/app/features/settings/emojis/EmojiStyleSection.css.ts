import { style } from '@vanilla-extract/css';
import { vars } from '@/theme/vars.css';

export const preview = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '6px',
  backgroundColor: vars.color.bgSecondary,
  border: `1px solid ${vars.color.border}`,
  borderRadius: vars.radius.md,
  padding: '10px 14px',
  marginBottom: '8px',
  userSelect: 'none',
});

export const previewLabel = style({
  fontSize: '0.75rem',
  color: vars.color.textMuted,
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
});

export const previewLine = style({
  fontSize: '1.25rem',
  lineHeight: 1.4,
  color: vars.color.textPrimary,
  wordBreak: 'break-word',
});

export const previewLineLarge = style({
  fontSize: 'var(--mudrix-emoji-only-size, 2.5rem)',
  lineHeight: 1.2,
  color: vars.color.textPrimary,
  wordBreak: 'break-word',
});
