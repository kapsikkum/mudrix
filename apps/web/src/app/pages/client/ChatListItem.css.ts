import { style, keyframes, globalStyle } from '@vanilla-extract/css';
import { vars } from '@/theme/vars.css';
import { uiSize } from '@/theme/uiDensity';
import { fast } from '@/theme/animations.css';
import { zIndex } from '@/theme/zIndex';
import { fontSize } from '@/theme/typeScale';
import { listNameplateWash } from '@/app/features/profile/ListCosmetics.css';

/**
 * One DM row, nameplate or not: a rounded card inset 8px from the list's edge, with the virtualizer's
 * 4px left under it as air, so the stride (dmRow) is the estimate and the height together.
 */
const dmRowCard = {
  boxSizing: 'border-box' as const,
  height: `calc(${uiSize('dmRow')} - 4px)`,
  margin: '0 8px',
  padding: '0 8px',
  borderRadius: vars.radius.md,
};

/** The avatar always fits the card with 6px above and below it, at every density. */
const dmAvatar = `min(${uiSize('roomAvatar')}, calc(${uiSize('dmRow')} - 16px))`;

export const roomItem = style({
  position: 'relative',
  isolation: 'isolate',
  display: 'flex',
  alignItems: 'center',
  padding: `calc((${uiSize('roomRow')} - ${uiSize('roomAvatar')}) / 2) 8px`,
  cursor: 'pointer',
  borderRadius: vars.radius.sm,
  margin: '0 4px',
  transition: `background-color ${fast}`,
  fontSize: fontSize.rem95,
  color: vars.color.textMuted,
  ':hover': {
    backgroundColor: vars.color.bgHover,
    color: vars.color.textPrimary,
  },
  selectors: {
    '&[data-fixed-height="true"]': dmRowCard,
    // A nameplate is the card's whole surface, so it shares the plain DM row's box exactly
    '&[data-nameplate="true"]': dmRowCard,

    '&[data-active="true"]:hover': {
      backgroundColor: vars.color.bgActive,
    },
    '&[data-active="true"]': {
      backgroundColor: vars.color.bgActive,
      color: vars.color.textPrimary,
    },
    // The surface is the whole affordance: a focus ring only for a keyboard visitor, never on click
    '&:focus': { outline: 'none' },
    '&:focus-visible': {
      outline: `2px solid ${vars.color.accent}`,
      outlineOffset: '-2px',
    },
    '&[data-has-notif="true"]': {
      color: vars.color.textPrimary,
    },
    '&[data-in-call="true"]': {
      color: vars.color.textPrimary,
    },
  },
});

// A nameplate is an image above the row's own background, so hover and selection wash the card itself
globalStyle(`${roomItem}:hover ${listNameplateWash}`, {
  backgroundColor: vars.color.bgHover,
});
globalStyle(`${roomItem}[data-active="true"] ${listNameplateWash}`, {
  backgroundColor: vars.color.bgActive,
});

export const chatAvatarImg = style({
  width: '100%',
  height: '100%',
  borderRadius: '50%',
  objectFit: 'cover',
});

export const chatTextContent = style({
  // The name takes its own width (and ellipsises) so a badge can sit right after it
  flex: '0 1 auto',
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  selectors: {
    // Over the banner the name is the row's one strong line: white, semibold, like the reference
    [`${roomItem}[data-nameplate="true"] &`]: {
      fontWeight: 600,
      color: vars.color.textPrimary,
    },
  },
});

/** The name and the badge that may follow it, on one line, centred; the name keeps the ellipsis. */
export const nameLine = style({
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
  minWidth: 0,
  width: '100%',
});

/** Optional pill right after a name: a tiny icon and 2-4 uppercase letters, on translucent dark. */
export const nameBadge = style({
  display: 'inline-flex',
  alignItems: 'center',
  gap: '2px',
  flexShrink: 0,
  height: '16px',
  padding: '0 6px',
  borderRadius: vars.radius.pill,
  backgroundColor: vars.scrim.base,
  color: vars.color.onAccent,
  fontSize: fontSize.xs,
  fontWeight: 600,
  letterSpacing: '0.04em',
  textTransform: 'uppercase',
  lineHeight: 1,
});

export const itemBadges = style({
  display: 'inline-flex',
  alignItems: 'center',
  gap: '8px',
  flexShrink: 0,
  marginLeft: '8px',
  maxWidth: '64px',
  overflow: 'hidden',
  transition: `opacity ${fast}, max-width ${fast}, margin-left ${fast}`,
  selectors: {
    [`${roomItem}:hover &`]: {
      opacity: 0,
      maxWidth: '0px',
      marginLeft: '0px',
    },
    '&:not(:has(*))': {
      marginLeft: 0,
    },
  },
});

export const chatAvatar = style({
  width: uiSize('roomAvatar'),
  height: uiSize('roomAvatar'),
  borderRadius: '50%',
  overflow: 'hidden',
  flexShrink: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: fontSize.rem85,
  position: 'relative',
  selectors: {
    [`${roomItem}[data-fixed-height="true"] &`]: {
      width: dmAvatar,
      height: dmAvatar,
    },
  },
});

export const avatarWrap = style({
  position: 'relative',
  width: uiSize('roomAvatar'),
  height: uiSize('roomAvatar'),
  flexShrink: 0,
  marginRight: '8px',
  selectors: {
    [`${roomItem}[data-fixed-height="true"] &`]: {
      width: dmAvatar,
      height: dmAvatar,
    },
    // Inside the banner the avatar keeps a thin dark ring so it separates from the art
    [`${roomItem}[data-nameplate="true"] &`]: {
      marginRight: '12px',
      borderRadius: '50%',
      boxShadow: `0 0 0 1px ${vars.scrim.base}`,
    },
  },
});

export const roomTypeBadge = style({
  position: 'absolute',
  right: '-4px',
  bottom: '-4px',
  width: '18px',
  height: '18px',
  borderRadius: '50%',
  backgroundColor: vars.color.bgPrimary,
  color: vars.color.textMuted,
  border: `1px solid ${vars.color.border}`,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: zIndex.raised,
  pointerEvents: 'none',
  selectors: {
    [`${roomItem}[data-active="true"] &`]: {
      color: vars.color.textPrimary,
    },
  },
});

export const roomTypeBadgeVoice = style([
  roomTypeBadge,
  {
    color: vars.color.success,
    borderColor: vars.color.success,
  },
]);

export const roomTypeIcon = style({
  width: uiSize('roomAvatar'),
  height: uiSize('roomAvatar'),
  flexShrink: 0,
  marginRight: '8px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: vars.color.textMuted,
  selectors: {
    [`${roomItem}[data-active="true"] &`]: {
      color: vars.color.textPrimary,
    },
  },
});

export const roomTypeIconVoice = style([
  roomTypeIcon,
  {
    color: vars.color.success,
  },
]);

export const callBadge = style({
  color: vars.color.success,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
});

export const mutedBadge = style({
  color: vars.color.textMuted,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
});

const bump = keyframes({
  '0%': { transform: 'scale(1)' },
  '40%': { transform: 'scale(1.2)' },
  '100%': { transform: 'scale(1)' },
});

export const badgeBump = style({
  animationName: bump,
  animationDuration: '150ms',
  animationTimingFunction: 'ease-out',
});

export const roomBadge = style({
  marginLeft: 'auto',
  backgroundColor: vars.color.accent,
  color: vars.color.onAccent,
  borderRadius: '8px',
  fontSize: fontSize.rem72,
  fontWeight: 600,
  padding: '1px 6px',
  minWidth: '18px',
  textAlign: 'center',
});

export const roomBadgeNotif = style([roomBadge, { backgroundColor: vars.color.mention }]);

export const itemMenuButton = style({
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
  width: '0px',
  height: '18px',
  marginLeft: '0px',
  padding: 0,
  overflow: 'hidden',
  borderRadius: vars.radius.sm,
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  color: vars.color.textMuted,
  opacity: 0,
  pointerEvents: 'none',
  transition: `width ${fast}, margin-left ${fast}, opacity ${fast}, color ${fast}`,
  selectors: {
    [`${roomItem}:hover &`]: {
      width: '18px',
      marginLeft: '8px',
      opacity: '1',
      pointerEvents: 'auto',
    },
    '&:hover': {
      color: vars.color.textPrimary,
    },
    '&:focus-visible': {
      width: '18px',
      marginLeft: '8px',
      opacity: '1',
      pointerEvents: 'auto',
      outline: `1px solid ${vars.color.accent}`,
      outlineOffset: '1px',
      color: vars.color.textPrimary,
    },
  },
  '@media': {
    '(pointer: coarse)': {
      // A finger-sized target: the full row height, and wide enough to tap without hitting the room.
      width: '44px',
      height: '40px',
      marginLeft: '0px',
      opacity: '1',
      pointerEvents: 'auto',
    },
  },
});

export const chatTextColumn = style({
  flex: 1,
  minWidth: 0,
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'center',
  lineHeight: 1.2,
  selectors: {
    // The scrim keeps the left readable, and this local halo keeps the name crisp where a bright
    // patch of art reaches it, whatever the name's length
    [`${roomItem}[data-nameplate="true"] &`]: {
      textShadow: `0 1px 2px ${vars.scrim.deep}`,
    },
  },
});

export const chatStatusLine = style({
  display: 'flex',
  alignItems: 'center',
  gap: '4px',
  minWidth: 0,
  fontSize: fontSize.rem72,
  color: vars.color.textMuted,
  opacity: 0.9,
});

export const chatStatusEmoji = style({
  flexShrink: 0,
  fontSize: fontSize.rem80,
  lineHeight: 1,
});

export const chatStatusText = style({
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});

export const presenceDot = style({
  position: 'absolute',
  // Tucked into the avatar's corner, 12px with a 2px page-coloured ring so it reads over art
  right: 0,
  bottom: 0,
  width: '12px',
  height: '12px',
  boxSizing: 'border-box',
  borderRadius: '50%',
  border: `2px solid ${vars.color.bgPrimary}`,
  pointerEvents: 'none',
  zIndex: zIndex.avatar,
});

export const presenceOnline = style({ backgroundColor: vars.color.success });
export const presenceIdle = style({ backgroundColor: vars.color.warning });
export const presenceDnd = style({ backgroundColor: vars.color.danger });
export const presenceOffline = style({ backgroundColor: vars.color.textMuted });

/** How long the call in a voice channel has been running. */
export const callTimer = style({
  color: vars.color.success,
  fontSize: fontSize.rem75,
  fontVariantNumeric: 'tabular-nums',
  marginRight: '4px',
  flexShrink: 0,
});
