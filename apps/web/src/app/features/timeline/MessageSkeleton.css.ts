import { keyframes, style } from '@vanilla-extract/css';
import { vars } from '@/theme/vars.css';
import { fadeIn } from '@/theme/animations.css';
import { msgRow, msgRowGrouped, msgAvatarCol, msgBody } from './Timeline.css';

// Every skeleton block carries one light band that sweeps across it. The band is a pseudo-element
// moved with transform, so the shimmer runs on the compositor (animating a background position
// would repaint every block each frame); backgroundColor is the static look when motion is reduced
// (global.css.ts collapses animation durations).
const sweep = keyframes({
  from: { transform: 'translateX(-100%)' },
  to: { transform: 'translateX(100%)' },
});

const shimmerBlock = {
  position: 'relative',
  overflow: 'hidden',
  backgroundColor: vars.color.bgTertiary,
  selectors: {
    '&::after': {
      content: '""',
      position: 'absolute',
      inset: 0,
      backgroundImage: `linear-gradient(90deg, transparent, ${vars.color.bgHover}, transparent)`,
      transform: 'translateX(-100%)',
      animation: `${sweep} 1.4s linear infinite`,
    },
  },
} as const;

export const list = style({
  display: 'flex',
  flexDirection: 'column',
  flexShrink: 0,
});

// Used for the full-timeline first load. The delay keeps the skeleton from
// flashing for a single frame when the room's events are available right away.
export const initial = style({
  flex: '1 1 0',
  minHeight: 0,
  overflow: 'hidden',
  justifyContent: 'flex-end',
  animation: `${fadeIn} 160ms ease-out 150ms both`,
});

// Rows reuse the real message row classes so paddings (including the compact
// message setting) always match the rows that replace them.
export const row = style([msgRow, { pointerEvents: 'none', userSelect: 'none' }]);
export const rowGrouped = style([msgRowGrouped, { pointerEvents: 'none', userSelect: 'none' }]);

export const region = style({
  display: 'flex',
  alignItems: 'flex-start',
  gap: '12px',
  flex: 1,
  minWidth: 0,
});

export const avatarCol = style([msgAvatarCol]);

export const avatar = style([
  shimmerBlock,
  {
    width: '28px',
    height: '28px',
    borderRadius: '50%',
    flexShrink: 0,
  },
]);

export const body = style([msgBody]);

// Same box as the sender-name line of a real message (0.9rem at line-height 1.5).
export const meta = style({
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  height: 'calc(0.9rem * 1.5)',
  marginBottom: '2px',
});

export const nameBar = style([
  shimmerBlock,
  {
    height: '0.7rem',
    borderRadius: '6px',
  },
]);

export const timeBar = style([
  shimmerBlock,
  {
    width: '38px',
    height: '0.55rem',
    borderRadius: '5px',
    opacity: 0.6,
  },
]);

// Same box as one rendered text line (0.95rem at line-height 1.55).
export const textLine = style({
  display: 'flex',
  alignItems: 'center',
  height: 'calc(0.95rem * 1.55)',
});

export const textBar = style([
  shimmerBlock,
  {
    height: '0.75rem',
    borderRadius: '6px',
    maxWidth: '100%',
  },
]);

// Mirrors mediaBox: full width up to 320px, 4:3 reserved box.
export const mediaBlock = style([
  shimmerBlock,
  {
    width: '100%',
    maxWidth: '320px',
    aspectRatio: '4 / 3',
    borderRadius: vars.radius.sm,
    marginTop: '2px',
  },
]);

// Stands in for the read-receipt column on the right of every real row.
export const receiptSpacer = style({
  width: '52px',
  flexShrink: 0,
});
