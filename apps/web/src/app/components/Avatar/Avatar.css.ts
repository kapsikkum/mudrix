import { style } from '@vanilla-extract/css';
import { vars } from '@/theme/vars.css';

export const avatarWrap = style({
  position: 'relative',
  display: 'inline-flex',
  flexShrink: 0,
  lineHeight: 0,
  overflow: 'visible',
});

export const avatarWrapFill = style([
  avatarWrap,
  {
    width: '100%',
    height: '100%',
    flexShrink: 1,
    overflow: 'visible',
  },
]);

export const avatarWrapClickable = style({
  cursor: 'pointer',
});

export const avatar = style({
  width: '40px',
  height: '40px',
  borderRadius: '50%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: '1rem',
  fontWeight: 600,
  color: '#fff',
  flexShrink: 0,
  overflow: 'hidden',
  userSelect: 'none',
});

export const avatarXs = style([avatar, { width: '20px', height: '20px', fontSize: '0.6rem' }]);
export const avatarSm = style([avatar, { width: '28px', height: '28px', fontSize: '0.75rem' }]);
export const avatarLg = style([avatar, { width: '56px', height: '56px', fontSize: '1.4rem' }]);
export const avatarXl = style([avatar, { width: '80px', height: '80px', fontSize: '2rem' }]);

export const avatarFill = style([
  avatar,
  {
    width: '100%',
    height: '100%',
    fontSize: '1rem',
    borderRadius: 'inherit',
  },
]);

export const avatarImg = style({
  width: '100%',
  height: '100%',
  objectFit: 'cover',
  borderRadius: 'inherit',
});

export const placeholderMark = style({
  width: '58%',
  height: '58%',
  color: '#fff',
  display: 'block',
});

const presenceDotBase = style({
  position: 'absolute',
  borderRadius: '50%',
  boxSizing: 'border-box',
  border: `2px solid ${vars.color.bgSecondary}`,
  pointerEvents: 'none',
});

export const presenceDotXs = style([
  presenceDotBase,
  {
    width: '9px',
    height: '9px',
    bottom: '-1px',
    right: '-1px',
  },
]);

export const presenceDotSm = style([
  presenceDotBase,
  {
    width: '12px',
    height: '12px',
    bottom: '-2px',
    right: '-2px',
  },
]);

export const presenceDotMd = style([
  presenceDotBase,
  {
    width: '15px',
    height: '15px',
    bottom: '-1px',
    right: '-1px',
  },
]);

export const presenceDotLg = style([
  presenceDotBase,
  {
    width: '18px',
    height: '18px',
    bottom: '0px',
    right: '0px',
  },
]);

export const presenceDotXl = style([
  presenceDotBase,
  {
    width: '21px',
    height: '21px',
    bottom: '1px',
    right: '1px',
  },
]);

export const presenceDotFill = style([
  presenceDotBase,
  {
    width: '15px',
    height: '15px',
    bottom: '-1px',
    right: '-1px',
  },
]);

export const presenceOnline = style({ backgroundColor: '#4ade80' });
export const presenceUnavailable = style({ backgroundColor: '#facc15' });
export const presenceOffline = style({ backgroundColor: '#6b7280' });
export const presenceDnd = style({ backgroundColor: '#ff4747' });

export const presenceDotButton = style({
  pointerEvents: 'auto',
  cursor: 'pointer',
  padding: 0,
  transition: 'transform 0.12s ease',
  ':hover': {
    transform: 'scale(1.35)',
  },
  ':focus-visible': {
    outline: `2px solid ${vars.color.accent}`,
    outlineOffset: '1px',
  },
});
