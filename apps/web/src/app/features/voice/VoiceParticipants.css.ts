import { globalStyle, style } from '@vanilla-extract/css';
import { vars } from '@/theme/vars.css';
import { fast } from '@/theme/animations.css';
import { TOUCH_UI } from '@/theme/uiDensity';
import { PARTICIPANT_SIZES } from './participantSize';

const desktop = PARTICIPANT_SIZES.desktop;
const touch = PARTICIPANT_SIZES.touch;
const px = (n: number) => `${n}px`;

export const wrap = style({
  display: 'flex',
  flexDirection: 'column',
  padding: `0 8px ${px(desktop.padBottom)} 36px`,
  gap: px(desktop.gap),
  overflow: 'hidden',
  selectors: {
    [`${TOUCH_UI} &`]: { padding: `0 12px ${px(touch.padBottom)} 60px`, gap: px(touch.gap) },
  },
});

const entryBase = style({
  display: 'flex',
  alignItems: 'center',
  gap: '7px',
  padding: `${px((desktop.row - desktop.avatar) / 2)} 6px ${px((desktop.row - desktop.avatar) / 2)} 4px`,
  borderRadius: vars.radius.sm,
  fontSize: '0.82rem',
  color: vars.color.textMuted,
  cursor: 'default',
  transition: `background-color ${fast}`,
  ':hover': { backgroundColor: vars.color.bgHover },
  selectors: {
    [`${TOUCH_UI} &`]: {
      gap: '10px',
      padding: `${px((touch.row - touch.avatar) / 2)} 8px ${px((touch.row - touch.avatar) / 2)} 4px`,
    },
  },
});

export const entry = entryBase;

export const entrySpeaking = style([entryBase, { color: vars.color.textPrimary }]);

const ringBase = style({
  width: px(desktop.avatar),
  height: px(desktop.avatar),
  borderRadius: '50%',
  overflow: 'hidden',
  flexShrink: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: '0.6rem',
  fontWeight: 700,
  selectors: {
    [`${TOUCH_UI} &`]: { width: px(touch.avatar), height: px(touch.avatar), fontSize: '0.85rem' },
  },
});

export const avatarRing = ringBase;

export const avatarRingSpeaking = style([
  ringBase,
  {
    outline: `2px solid ${vars.color.success}`,
  },
]);

export const name = style({
  flex: 1,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  fontSize: '0.82rem',
  selectors: { [`${TOUCH_UI} &`]: { fontSize: '0.95rem' } },
});

export const icons = style({
  display: 'flex',
  alignItems: 'center',
  gap: '5px',
  flexShrink: 0,
  marginLeft: 'auto',
  selectors: { [`${TOUCH_UI} &`]: { gap: '8px' } },
});

const iconBase = style({
  fontSize: '0.68rem',
  display: 'inline-flex',
  alignItems: 'center',
  flexShrink: 0,
});

export const iconMicMuted = style([iconBase, { color: vars.color.error }]);

export const iconCamera = style([iconBase, { color: vars.color.success }]);

export const livePill = style({
  display: 'inline-flex',
  alignItems: 'center',
  padding: '0 5px',
  borderRadius: '999px',
  background: '#593695',
  color: '#ffffff',
  fontSize: '0.56rem',
  fontWeight: 700,
  lineHeight: '14px',
  textTransform: 'uppercase',
  letterSpacing: '0.03em',
  userSelect: 'none',
  selectors: {
    [`${TOUCH_UI} &`]: { fontSize: '0.68rem', lineHeight: '18px', padding: '0 7px' },
  },
});

export const compactWrap = style({
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
  height: px(desktop.compact),
  padding: `0 8px ${px(desktop.compact - desktop.compactAvatar - 6)} 40px`,
  boxSizing: 'border-box',
  selectors: {
    [`${TOUCH_UI} &`]: {
      gap: '8px',
      height: px(touch.compact),
      padding: `0 12px ${px(touch.compact - touch.compactAvatar - 8)} 60px`,
    },
  },
});

const compactAvatarBase = style({
  display: 'inline-flex',
  flexShrink: 0,
  padding: 0,
  border: 'none',
  borderRadius: '50%',
  background: 'none',
  cursor: 'pointer',
});

export const compactAvatar = compactAvatarBase;

export const compactAvatarSpeaking = style([
  compactAvatarBase,
  { outline: `2px solid ${vars.color.success}` },
]);

export const compactMore = style({
  fontSize: '0.75rem',
  selectors: { [`${TOUCH_UI} &`]: { fontSize: '0.9rem' } },
  fontWeight: 600,
  color: vars.color.textMuted,
  whiteSpace: 'nowrap',
});

globalStyle(`${TOUCH_UI} ${icons} svg`, { width: '16px', height: '16px' });
