import { style, keyframes } from '@vanilla-extract/css';
import { vars } from '@/theme/vars.css';

export const container = style({
  display: 'flex',
  flexDirection: 'column',
  height: '100%',
  overflow: 'hidden',
});

export const pageScroll = style({
  flex: 1,
  overflowY: 'auto',
  minHeight: 0,
  position: 'relative',
});

export const pageContent = style({
  display: 'flex',
  flexDirection: 'column',
  minHeight: '100%',
  padding: '24px 150px 24px',
});

export const spaceHeader = style({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  textAlign: 'center',
  gap: '12px',
  marginBottom: '32px',
  padding: '16px 0',
});

export const spaceInfo = style({
  textAlign: 'center',
  maxWidth: '100%',
});

export const spaceName = style({
  fontSize: '1.25rem',
  fontWeight: 700,
  color: vars.color.textPrimary,
  margin: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  maxWidth: '100%',
});

export const spaceTopic = style({
  fontSize: '0.85rem',
  color: vars.color.textMuted,
  marginTop: '4px',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  maxWidth: '100%',
});

export const spaceMeta = style({
  fontSize: '0.8rem',
  color: vars.color.textMuted,
  marginTop: '4px',
});

export const errorBanner = style({
  margin: '8px 16px',
  padding: '10px 14px',
  borderRadius: vars.radius.sm,
  backgroundColor: 'rgba(220, 60, 60, 0.12)',
  color: vars.color.error ?? '#d43b3b',
  fontSize: '0.85rem',
  textAlign: 'center',
  wordBreak: 'break-word',
});

export const spaceActions = style({
  display: 'flex',
  gap: '8px',
  flexShrink: 0,
  alignItems: 'center',
});

export const roomRow = style({
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  padding: '6px 10px',
  borderRadius: vars.radius.md,
  backgroundColor: vars.color.bgPrimary,
  border: `1px solid ${vars.color.border}`,
  selectors: {
    '&:hover': {
      backgroundColor: vars.color.bgHover,
    },
  },
});

export const roomRowClickable = style([roomRow, { cursor: 'pointer' }]);

export const roomRowDivider = style({
  width: '1px',
  height: '20px',
  backgroundColor: vars.color.border,
  flexShrink: 0,
  marginLeft: '4px',
});

export const roomRowActions = style({
  display: 'flex',
  gap: '4px',
  flexShrink: 0,
  alignItems: 'center',
});

export const roomInfo = style({
  flex: 1,
  minWidth: 0,
});

export const roomName = style({
  fontSize: '0.88rem',
  fontWeight: 500,
  color: vars.color.textPrimary,
  display: 'flex',
  alignItems: 'center',
  gap: '5px',
  overflow: 'hidden',
});

export const roomMeta = style({
  fontSize: '0.76rem',
  color: vars.color.textMuted,
  display: 'flex',
  alignItems: 'center',
  gap: '5px',
  overflow: 'hidden',
  marginTop: '1px',
});

export const metaDivider = style({
  width: '2px',
  height: '2px',
  borderRadius: '50%',
  backgroundColor: vars.color.textMuted,
  flexShrink: 0,
  opacity: 0.5,
});

export const roomTopicText = style({
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  minWidth: 0,
});

export const memberCount = style({
  display: 'flex',
  alignItems: 'center',
  gap: '3px',
  flexShrink: 0,
});

export const emptyState = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '6px 10px',
  borderRadius: vars.radius.md,
  backgroundColor: vars.color.bgPrimary,
  border: `1px solid ${vars.color.border}`,
  color: vars.color.textMuted,
  fontSize: '0.82rem',
});

export const noPreviewScreen = style({
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '14px',
  padding: '0 32px',
  textAlign: 'center',
});

export const noPreviewText = style({
  color: vars.color.textMuted,
  fontSize: '0.9rem',
  maxWidth: '320px',
});

const skeletonPulseKeyframes = keyframes({
  '0%': { opacity: 0.6 },
  '50%': { opacity: 1 },
  '100%': { opacity: 0.6 },
});

const skeletonPulse = style({
  animation: `${skeletonPulseKeyframes} 1.4s ease-in-out infinite`,
});

const revealKeyframes = keyframes({
  '0%': { opacity: 0, transform: 'translateY(4px)' },
  '100%': { opacity: 1, transform: 'translateY(0)' },
});

const reveal = style({ animation: `${revealKeyframes} 0.22s ease` });

export const skeletonHeader = style([
  skeletonPulse,
  {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '12px',
    marginBottom: '32px',
    padding: '16px 0',
  },
]);

export const skeletonAvatarCircle = style({
  width: '64px',
  height: '64px',
  borderRadius: '50%',
  backgroundColor: vars.color.bgTertiary,
});

export const skeletonLine = style({
  height: '14px',
  borderRadius: vars.radius.sm,
  backgroundColor: vars.color.bgTertiary,
});

export const skeletonLineWide = style([skeletonLine, { width: '180px' }]);
export const skeletonLineShort = style([skeletonLine, { width: '120px' }]);

export const skeletonActions = style({
  display: 'flex',
  gap: '8px',
  marginTop: '4px',
});

export const skeletonButton = style({
  width: '80px',
  height: '30px',
  borderRadius: vars.radius.sm,
  backgroundColor: vars.color.bgTertiary,
});

export const skeletonSectionRow = style([
  skeletonPulse,
  {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '4px 8px',
    marginBottom: '6px',
  },
]);

export const skeletonSectionChevron = style({
  width: '18px',
  height: '18px',
  borderRadius: vars.radius.sm,
  backgroundColor: vars.color.bgTertiary,
  flexShrink: 0,
});

export const skeletonSectionInfo = style({
  flex: 1,
  minWidth: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: '3px',
});

export const skeletonSectionLine = style({
  height: '12px',
  width: '120px',
  maxWidth: '100%',
  borderRadius: vars.radius.sm,
  backgroundColor: vars.color.bgTertiary,
});

export const skeletonSectionMeta = style({
  height: '8px',
  width: '60px',
  borderRadius: vars.radius.sm,
  backgroundColor: vars.color.bgTertiary,
});

export const skeletonSectionBtn = style({
  width: '28px',
  height: '28px',
  borderRadius: vars.radius.sm,
  backgroundColor: vars.color.bgTertiary,
  flexShrink: 0,
});

export const skeletonRoomRow = style([
  skeletonPulse,
  {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '6px 10px',
    borderRadius: vars.radius.md,
    backgroundColor: vars.color.bgPrimary,
    border: `1px solid ${vars.color.border}`,
  },
]);

export const skeletonRoomBtn = style({
  width: '28px',
  height: '28px',
  borderRadius: vars.radius.sm,
  backgroundColor: vars.color.bgTertiary,
  flexShrink: 0,
});

export const skeletonRoomAvatar = style({
  width: '28px',
  height: '28px',
  borderRadius: '50%',
  backgroundColor: vars.color.bgTertiary,
  flexShrink: 0,
});

export const skeletonRoomInfo = style({
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  gap: '3px',
});

export const skeletonRoomName = style({
  height: '10px',
  width: '140px',
  borderRadius: vars.radius.sm,
  backgroundColor: vars.color.bgTertiary,
});

export const skeletonRoomMeta = style({
  height: '8px',
  width: '80px',
  borderRadius: vars.radius.sm,
  backgroundColor: vars.color.bgTertiary,
});

export const spaceLoadingList = style([
  reveal,
  {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    padding: '2px 0 4px',
  },
]);

export const spaceSection = style([reveal, { marginBottom: '12px' }]);

export const spaceSectionHeader = style({
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  padding: '6px 10px',
  borderRadius: vars.radius.sm,
  cursor: 'pointer',
  userSelect: 'none',
  width: '100%',
  background: 'none',
  border: 'none',
  color: vars.color.textPrimary,
  marginBottom: '2px',
  selectors: {
    '&:hover': {
      backgroundColor: vars.color.bgHover,
    },
  },
});

export const spaceSectionChevronButton = style({
  flexShrink: 0,
  width: '20px',
  height: '22px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 0,
  background: 'none',
  border: 'none',
  color: vars.color.textMuted,
  cursor: 'pointer',
  userSelect: 'none',
  borderRadius: vars.radius.sm,
  selectors: {
    '&:hover': {
      color: vars.color.textPrimary,
    },
    '&:focus-visible': {
      outline: `1px solid ${vars.color.accent}`,
      outlineOffset: '1px',
    },
  },
});

export const spaceSectionChevron = style({
  flexShrink: 0,
  color: vars.color.textMuted,
  transition: 'transform 0.15s ease',
});

export const spaceSectionChevronClosed = style({
  transform: 'rotate(-90deg)',
});

export const spaceSectionTitle = style({
  flex: 1,
  minWidth: 0,
  display: 'flex',
  flexDirection: 'column',
  textAlign: 'left',
});

export const spaceSectionName = style({
  fontSize: '0.92rem',
  fontWeight: 600,
  color: vars.color.textPrimary,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});

export const spaceSectionMeta = style({
  fontSize: '0.76rem',
  color: vars.color.textMuted,
  display: 'flex',
  alignItems: 'center',
  gap: '3px',
  marginTop: '1px',
});

export const spaceSectionActions = style({
  display: 'flex',
  gap: '4px',
  flexShrink: 0,
  alignItems: 'center',
});

export const spaceSectionRoomsNested = style([
  reveal,
  {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    padding: '2px 0 4px',
  },
]);

export const spaceSectionRoomItem = style({
  boxSizing: 'border-box',
});

export const suggestedBadge = style({
  display: 'inline-flex',
  alignItems: 'center',
  color: vars.color.success,
});
