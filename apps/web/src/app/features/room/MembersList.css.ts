import { style, keyframes } from '@vanilla-extract/css';
import { vars } from '@/theme/vars.css';
import { uiSize } from '@/theme/uiDensity';
import { fontSize } from '@/theme/typeScale';

export const membersListContainer = style({
  display: 'flex',
  flexDirection: 'column',
  flex: 1,
  minHeight: 0,
  overflow: 'hidden',
});

export const membersScrollArea = style({
  flex: 1,
  overflowY: 'auto',
  minHeight: 0,
});

export const memberRow = style({
  position: 'relative',
  isolation: 'isolate',
  boxSizing: 'border-box',
  height: `calc(${uiSize('memberRow')} - 4px)`,
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  padding: `calc((${uiSize('memberRow')} - 28px) / 2) 12px`,
  borderRadius: vars.radius.sm,
  margin: '0 4px',
  cursor: 'default',
  ':hover': {
    backgroundColor: vars.color.bgHover,
  },
});

export const memberName = style({
  fontSize: fontSize.rem88,
  color: vars.color.textMuted,
  flex: 1,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});

/** Name with the custom status underneath it (Discord style). */
export const memberTextColumn = style({
  display: 'flex',
  flexDirection: 'column',
  flex: 1,
  minWidth: 0,
});

export const memberStatus = style({
  display: 'flex',
  alignItems: 'center',
  gap: '4px',
  minWidth: 0,
  fontSize: fontSize.rem78,
  color: vars.color.textMuted,
});

export const memberStatusEmoji = style({
  flexShrink: 0,
  fontSize: fontSize.rem95,
  lineHeight: 1,
});

export const memberStatusText = style({
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});

export const memberMusicIcon = style({
  flexShrink: 0,
  display: 'inline-flex',
  color: '#3ba55d',
});

export const memberGameIcon = style({
  flexShrink: 0,
  display: 'inline-flex',
  color: vars.color.textSecondary,
});

export const memberStatusMore = style({
  flexShrink: 0,
});

export const memberStatusDot = style({
  flexShrink: 0,
});

export const emptyState = style({
  padding: '16px',
  fontSize: fontSize.rem85,
  color: vars.color.textMuted,
  textAlign: 'center',
});

const skeletonPulseKeyframes = keyframes({
  '0%': { opacity: 0.6 },
  '50%': { opacity: 1 },
  '100%': { opacity: 0.6 },
});

const skeletonPulse = style({
  animation: `${skeletonPulseKeyframes} 1.4s ease-in-out infinite`,
});

export const skeletonList = style({
  padding: '0 12px',
});

export const skeletonRow = style([
  skeletonPulse,
  {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '7px 0',
  },
]);

export const skeletonAvatar = style({
  width: '28px',
  height: '28px',
  borderRadius: '50%',
  backgroundColor: vars.color.bgTertiary,
  flexShrink: 0,
});

export const skeletonLine = style({
  height: '12px',
  borderRadius: vars.radius.sm,
  backgroundColor: vars.color.bgTertiary,
  flex: 1,
  maxWidth: '140px',
});

export const roleHeader = style({
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
  padding: '0 12px',
  userSelect: 'none',
});

export const roleHeaderLabel = style({
  fontSize: fontSize.rem75,
  fontWeight: 600,
  color: vars.color.textMuted,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});

export const roleHeaderCount = style({
  fontSize: fontSize.rem75,
  fontWeight: 600,
  color: vars.color.textMuted,
  opacity: 0.7,
  flexShrink: 0,
});
