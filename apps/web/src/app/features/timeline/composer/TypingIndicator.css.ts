import { keyframes, style } from '@vanilla-extract/css';
import { vars } from '@/theme/vars.css';
import { fast, fadeIn } from '@/theme/animations.css';
import { zIndex } from '@/theme/zIndex';
import { fontSize } from '@/theme/typeScale';

export const TYPING_INDICATOR_HEIGHT = 20;
export const TYPING_INDICATOR_PADDING = 2;
export const TYPING_INDICATOR_TOP_GAP = 2;
export const TYPING_INDICATOR_GAP = 4;

export const TYPING_INDICATOR_BAND_HEIGHT =
  TYPING_INDICATOR_PADDING +
  TYPING_INDICATOR_HEIGHT +
  TYPING_INDICATOR_GAP +
  TYPING_INDICATOR_TOP_GAP;

export const typingIndicator = style({
  position: 'absolute',
  bottom: '100%',
  left: 0,
  right: 0,
  height: `${TYPING_INDICATOR_PADDING + TYPING_INDICATOR_HEIGHT + TYPING_INDICATOR_GAP}px`,
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
  padding: `${TYPING_INDICATOR_PADDING}px 12px ${TYPING_INDICATOR_GAP}px`,
  fontSize: fontSize.rem80,
  color: vars.color.textMuted,
  overflow: 'hidden',
  pointerEvents: 'none',
  zIndex: zIndex.badge,
  backgroundColor: vars.color.bgSecondary,
  animationName: fadeIn,
  animationDuration: fast,
});

export const avatars = style({
  display: 'flex',
  alignItems: 'center',
  flexShrink: 0,
});

export const stackedAvatar = style({
  width: `${TYPING_INDICATOR_HEIGHT}px`,
  height: `${TYPING_INDICATOR_HEIGHT}px`,
  borderRadius: '50%',
  marginRight: '-6px',
  selectors: {
    '&:last-child': { marginRight: 0 },
  },
});

export const text = style({
  lineHeight: 1.4,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  flexShrink: 1,
  minWidth: 0,
});

const spin = keyframes({ to: { transform: 'rotate(360deg)' } });

export const spinner = style({
  width: '12px',
  height: '12px',
  marginLeft: '4px',
  flexShrink: 0,
  borderRadius: '50%',
  border: `2px solid ${vars.color.border}`,
  borderTopColor: vars.color.warning,
  animation: `${spin} 0.8s linear infinite`,
});

export const offline = style([typingIndicator, { color: vars.color.warning }]);

export const name = style({ color: vars.color.textPrimary });
