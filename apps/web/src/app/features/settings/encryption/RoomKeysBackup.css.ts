import { style } from '@vanilla-extract/css';
import { vars } from '@/theme/vars.css';
import { fontSize } from '@/theme/typeScale';

export const form = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '10px',
  maxWidth: '420px',
});

export const subtitle = style({
  margin: 0,
  fontSize: fontSize.rem88,
  fontWeight: 600,
  color: vars.color.textPrimary,
});

export const fileRow = style({
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  flexWrap: 'wrap',
  minWidth: 0,
});

export const fileName = style({
  fontSize: fontSize.rem82,
  color: vars.color.textMuted,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  minWidth: 0,
});
