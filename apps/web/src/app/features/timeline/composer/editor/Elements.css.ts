import { globalStyle, style, styleVariants } from '@vanilla-extract/css';
import { vars } from '@/theme/vars.css';

export const url = style({
  color: vars.color.link,
});

/** A misspelled word in the composer. */
export const misspelled = style({
  textDecoration: 'underline wavy',
  textDecorationColor: vars.color.danger,
  textUnderlineOffset: '2px',
});

const headingBase = style({
  fontWeight: 600,
  lineHeight: 1.3,
  margin: '4px 0',
});

export const heading = styleVariants({
  1: [headingBase, { fontSize: '1.4em' }],
  2: [headingBase, { fontSize: '1.28em' }],
  3: [headingBase, { fontSize: '1.16em' }],
});

export const listItem = style({
  position: 'relative',
  paddingLeft: '1.6em',
  selectors: {
    '&::before': {
      position: 'absolute',
      left: 0,
      width: '1.3em',
      textAlign: 'right',
      color: vars.color.textMuted,
      userSelect: 'none',
    },
    '&[data-list-item="bulleted"]::before': {
      content: '"•"',
    },
    '&[data-list-item="numbered"]': {
      counterIncrement: 'wz-list',
    },
    '&[data-list-item="numbered"]::before': {
      content: 'counter(wz-list) "."',
    },
  },
});

globalStyle('[data-slate-editor] > :not([data-list-item="numbered"])', {
  counterReset: 'wz-list',
});
