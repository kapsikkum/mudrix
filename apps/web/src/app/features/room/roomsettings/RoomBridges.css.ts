import { style } from '@vanilla-extract/css';
import { vars } from '@/theme/vars.css';

export const list = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '12px',
});

export const row = style({
  display: 'flex',
  alignItems: 'flex-start',
  gap: '12px',
});

export const text = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '2px',
  minWidth: 0,
});

export const protocol = style({
  fontWeight: 600,
  fontSize: '0.92rem',
  color: vars.color.textPrimary,
});

export const target = style({
  display: 'flex',
  alignItems: 'center',
  flexWrap: 'wrap',
  gap: '4px',
  fontSize: '0.85rem',
  color: vars.color.textPrimary,
  wordBreak: 'break-word',
});

export const separator = style({
  color: vars.color.textMuted,
  margin: '0 2px',
});

export const channelLink = style({
  display: 'inline-flex',
  alignItems: 'center',
  gap: '3px',
  color: vars.color.link,
  ':hover': { textDecoration: 'underline' },
});

export const meta = style({
  fontSize: '0.78rem',
  color: vars.color.textMuted,
});

export const userLink = style({
  border: 'none',
  background: 'none',
  padding: 0,
  font: 'inherit',
  color: 'inherit',
  cursor: 'pointer',
  ':hover': { color: vars.color.textPrimary, textDecoration: 'underline' },
});
