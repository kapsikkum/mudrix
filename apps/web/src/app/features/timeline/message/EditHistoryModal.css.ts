import { style } from '@vanilla-extract/css';
import { vars } from '@/theme/vars.css';
import { fontSize } from '@/theme/typeScale';

export const list = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '10px',
  maxHeight: '60vh',
  overflowY: 'auto',
});

export const version = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '4px',
  padding: '10px 12px',
  borderRadius: vars.radius.sm,
  backgroundColor: vars.color.bgTertiary,
});

export const versionMeta = style({
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  fontSize: fontSize.rem75,
  color: vars.color.textMuted,
});

export const versionBadge = style({
  color: vars.color.accent,
  fontWeight: 600,
});

export const versionBody = style({
  fontSize: fontSize.rem92,
  color: vars.color.textPrimary,
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
});

export const status = style({
  padding: '16px 0',
  textAlign: 'center',
  color: vars.color.textMuted,
  fontSize: fontSize.rem90,
});
