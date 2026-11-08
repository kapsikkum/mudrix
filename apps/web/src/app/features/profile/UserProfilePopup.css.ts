export const modalScaleIn = keyframes({
  '0%': {
    opacity: 0,
    transform: 'translate(-50%, -50%) scale(0.95)',
  },
  '100%': {
    opacity: 1,
    transform: 'translate(-50%, -50%) scale(1)',
  },
});

import { PANEL_OVERLAY_QUERY } from '@/const/breakpoints';
import { style, keyframes, globalStyle } from '@vanilla-extract/css';
import { vars } from '@/theme/vars.css';
import { profileFramePieceBottom } from './ProfileCard.css';
import { scaleIn, fast } from '@/theme/animations.css';
import { iconDanger } from '@/app/components/Button/Button.css';
import { zIndex } from '@/theme/zIndex';
import { fontSize } from '@/theme/typeScale';

export const overlay = style({
  position: 'fixed',
  inset: 0,
  zIndex: zIndex.dialog,
  '@media': {
    [PANEL_OVERLAY_QUERY]: {
      backgroundColor: vars.scrim.base,
    },
  },
});

export const popup = style({
  position: 'fixed',
  zIndex: zIndex.dialogRaised,
  width: '320px',
  backgroundColor: vars.color.bgPrimary,
  // The accent (or the theme's own) washes down from the banner into the card.
  backgroundImage: `radial-gradient(130% 55% at 50% 0%, color-mix(in srgb, var(--card-accent, ${vars.color.accent}) 26%, transparent), transparent 75%)`,
  border: `1px solid ${vars.color.border}`,
  borderRadius: '16px',
  boxShadow: '0 8px 32px rgba(0,0,0,0.35)',
  animation: `${scaleIn} ${fast} ease`,
  display: 'flex',
  flexDirection: 'column',
  padding: 0,
  maxHeight: 'calc(100vh - 32px)',
  '@media': {
    // Bottom sheet on phones: full width, pinned to the bottom edge, scrolls if tall.
    // The inner wrapper scrolls, so the profile frame can still hang over the card's edges.
    [PANEL_OVERLAY_QUERY]: {
      left: '20px !important',
      right: '20px !important',
      top: 'auto !important',
      bottom: 'calc(64px + var(--safe-bottom)) !important',
      transform: 'none !important',
      width: 'auto',
      maxHeight: 'calc(100dvh - 200px)',
      overflow: 'visible',
    },
  },
  // Visible so an avatar decoration can spill past the card edge (as on Discord); the cover
  // rounds its own top corners instead of relying on the card to clip it.
  overflow: 'visible',
});

export const popupScroll = style({
  display: 'contents',
  '@media': {
    [PANEL_OVERLAY_QUERY]: {
      display: 'flex',
      flexDirection: 'column',
      minHeight: 0,
      maxHeight: 'calc(100dvh - 200px)',
      overflowY: 'auto',
      borderRadius: '16px',
    },
  },
});

export const coverWrap = style({
  margin: '-20px -20px 0',
  position: 'relative',
  height: '110px',
  flexShrink: 0,
  overflow: 'hidden',
  borderTopLeftRadius: vars.radius.md,
  borderTopRightRadius: vars.radius.md,
});

export const popoutCoverWrap = style({
  position: 'relative',
  height: '110px',
  width: '100%',
  flexShrink: 0,
  overflow: 'hidden',
  borderTopLeftRadius: '15px',
  borderTopRightRadius: '15px',
  maskImage: 'linear-gradient(to bottom, #000 55%, transparent 100%)',
  WebkitMaskImage: 'linear-gradient(to bottom, #000 55%, transparent 100%)',
});

export const cover = style({
  position: 'absolute',
  inset: 0,
  width: '100%',
  height: '100%',
  objectFit: 'cover',
  display: 'block',
  pointerEvents: 'none',
});

export const coverFallback = style({
  position: 'absolute',
  inset: 0,
  pointerEvents: 'none',
});

export const coverNeutral = style({
  position: 'absolute',
  inset: 0,
  pointerEvents: 'none',
  backgroundColor: vars.color.bgTertiary,
});

export const popoutAvatarRow = style({
  position: 'relative',
  marginTop: '-42px',
  padding: '0 16px',
  display: 'flex',
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'space-between',
  zIndex: zIndex.above,
});

export const cardBody = style({
  margin: '6px 4px 10px',
  padding: '6px 14px',
  display: 'flex',
  flexDirection: 'column',
  gap: '8px',
  position: 'relative',
  zIndex: zIndex.above,
  maxHeight: 'min(520px, calc(100vh - 240px))',
  overflowY: 'auto',
  overflowX: 'hidden',
  selectors: {
    '&::-webkit-scrollbar': {
      width: '4px',
    },
    '&::-webkit-scrollbar-thumb': {
      backgroundColor: vars.color.bgHover,
      borderRadius: '2px',
    },
  },
});

export const bodyDivider = style({
  width: '100%',
  height: '1px',
  backgroundColor: vars.color.border,
  margin: '4px 0',
  flexShrink: 0,
});

export const sectionHeader = style({
  fontSize: fontSize.rem72,
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  color: vars.color.textMuted,
  marginBottom: '2px',
});

export const frameClearance = style({
  height: '32px',
  flexShrink: 0,
  pointerEvents: 'none',
});

export const topRow = style({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'flex-start',
  gap: '4px',
  marginTop: '-42px',
  position: 'relative',
  zIndex: zIndex.lifted,
});

export const avatarRow = style({
  display: 'flex',
  flexDirection: 'row',
  alignItems: 'center',
  gap: '4px',
  width: '100%',
});

export const avatarWrap = style({
  position: 'relative',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
  borderRadius: '50%',
  lineHeight: 0,
  flexShrink: 0,
  backgroundColor: vars.color.bgPrimary,
  padding: '4px',
  boxShadow: `0 0 0 1px ${vars.color.border}`,
});

export const nameSection = style({
  position: 'relative',
  alignSelf: 'stretch',
  display: 'flex',
  flexDirection: 'row',
  flexWrap: 'wrap',
  alignItems: 'center',
  columnGap: '8px',
  rowGap: '2px',
  minWidth: 0,
  maxWidth: '100%',
});

export const displayName = style({
  flexBasis: '100%',
  boxSizing: 'border-box',
  paddingRight: 'var(--badge-room, 0px)',
  fontSize: fontSize.rem130,
  fontWeight: 700,
  color: vars.color.textPrimary,
  wordBreak: 'break-word',
  lineHeight: 1.3,
});

export const userIdRow = style({
  display: 'flex',
  maxWidth: 'calc(100% - var(--badge-room, 0px))',
  alignItems: 'center',
  gap: '4px',
});

export const userId = style({
  fontSize: fontSize.rem80,
  color: vars.color.textMuted,
  fontFamily: 'monospace',
  wordBreak: 'break-all',
  lineHeight: 1.3,
});

export const infoRow = style({
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  fontSize: fontSize.rem85,
});

export const infoIcon = style({
  display: 'flex',
  alignItems: 'center',
  color: vars.color.textMuted,
  flexShrink: 0,
});

export const infoValue = style({
  color: vars.color.textPrimary,
  fontWeight: 500,
  marginRight: 'auto',
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});

export const roleBadge = style({
  fontSize: fontSize.rem75,
  fontWeight: 600,
  padding: '2px 8px 2px 6px',
  borderRadius: vars.radius.sm,
  textTransform: 'capitalize',
  flexShrink: 0,
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px',
  backgroundColor: vars.color.bgTertiary,
  border: `1px solid ${vars.color.border}`,
  color: vars.color.textPrimary,
});

export const roleDot = style({
  width: '12px',
  height: '12px',
  borderRadius: '50%',
  flexShrink: 0,
});

export const roleAdminDot = style([roleDot, { backgroundColor: '#ef4444' }]);
export const roleModeratorDot = style([roleDot, { backgroundColor: '#eab308' }]);
export const roleMemberDot = style([roleDot, { backgroundColor: '#3b82f6' }]);
export const roleFounderDot = style([roleDot, { backgroundColor: '#a855f7' }]);

export const roleAdmin = style([roleBadge]);
export const roleModerator = style([roleBadge]);
export const roleMember = style([roleBadge]);
export const roleFounder = style([roleBadge]);

export const modActions = style({
  display: 'flex',
  gap: '8px',
});

export const modActionBtn = style({
  flex: 1,
});

export const primaryRow = style({
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
});

export const primaryBtn = style({
  flex: 1,
});

export const hiddenInput = style({
  position: 'absolute',
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap',
  border: 0,
});

export const avatarWrapEditable = style({
  position: 'relative',
});

export const avatarEdit = style({
  position: 'absolute',
  inset: '4px',
  borderRadius: '50%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  backgroundColor: 'rgba(0,0,0,0.4)',
  color: 'rgba(255,255,255,0.9)',
  opacity: 0,
  transition: 'opacity 0.15s ease',
  pointerEvents: 'none',
  selectors: {
    [`${avatarWrapEditable}:hover &`]: { opacity: 1 },
  },
});

export const accountsSection = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '8px',
});

export const accountsDivider = style({
  height: '1px',
  backgroundColor: vars.color.border,
  margin: '2px 0',
});

export const switchRow = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '8px',
  width: '100%',
  padding: '8px',
  borderRadius: vars.radius.sm,
  border: '1px solid transparent',
  backgroundColor: 'transparent',
  color: vars.color.textPrimary,
  fontSize: fontSize.rem90,
  fontWeight: 500,
  textAlign: 'left',
  cursor: 'pointer',
  selectors: {
    '&:hover': {
      backgroundColor: vars.color.bgTertiary,
    },
  },
});

export const accountsFlyout = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '4px',
  minWidth: '240px',
});

export const accountRow = style({
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
  padding: '6px 8px',
  borderRadius: vars.radius.sm,
  cursor: 'pointer',
  border: '1px solid transparent',
  selectors: {
    '&:hover': {
      backgroundColor: vars.color.bgTertiary,
    },
  },
});

export const accountRowActive = style({
  border: `1px solid ${vars.color.success}`,
  backgroundColor: vars.color.bgTertiary,
  cursor: 'default',
});

export const accountMeta = style({
  display: 'flex',
  flexDirection: 'column',
  minWidth: 0,
  flex: 1,
});

export const accountName = style({
  fontSize: fontSize.rem85,
  fontWeight: 500,
  color: vars.color.textPrimary,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});

export const accountServer = style({
  fontSize: fontSize.rem75,
  color: vars.color.textMuted,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});

export const pronouns = style({
  fontSize: fontSize.rem80,
  color: vars.color.textSecondary,
  lineHeight: 1.3,
  selectors: {
    '&::before': { content: '"•"', marginRight: '8px', color: vars.color.textMuted },
  },
});

export const bioBox = style({
  fontSize: fontSize.rem85,
  color: vars.color.textPrimary,
  lineHeight: 1.45,
  whiteSpace: 'pre-wrap',
  overflowWrap: 'anywhere',
  maxHeight: '140px',
  overflowY: 'auto',
  padding: '2px 0 2px 12px',
  borderLeft: `3px solid var(--card-accent, ${vars.color.accent})`,
});

export const bioLink = style({
  color: vars.color.accent,
  textDecoration: 'none',
  selectors: {
    '&:hover': { textDecoration: 'underline' },
  },
});

export const timeValue = style({
  color: vars.color.textPrimary,
  fontWeight: 500,
});

export const timeOffset = style({
  color: vars.color.textMuted,
  marginLeft: '6px',
});

export const note = style({
  fontSize: fontSize.rem85,
  color: vars.color.textMuted,
  margin: 0,
});

export const viewFullProfileBtn = style({
  width: '100%',
  marginTop: '4px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '6px',
  padding: '8px 12px',
  borderRadius: vars.radius.sm,
  backgroundColor: 'transparent',
  border: 'none',
  color: vars.color.textSecondary,
  fontSize: fontSize.rem85,
  fontWeight: 500,
  cursor: 'pointer',
  transition: `background-color ${fast}, color ${fast}`,
  selectors: {
    '&:hover': {
      backgroundColor: vars.color.bgHover,
      color: vars.color.textPrimary,
    },
  },
});

export const fullModalOverlay = style({
  position: 'fixed',
  inset: 0,
  zIndex: zIndex.dialog,
  backgroundColor: vars.scrim.deep,
  backdropFilter: 'blur(2px)',
  '@media': {
    // The sheet on phones: a light scrim, so the chat behind stays visible. A tap on it dismisses.
    [PANEL_OVERLAY_QUERY]: {
      backgroundColor: vars.scrim.soft,
      backdropFilter: 'none',
    },
  },
});

export const fullModal = style({
  position: 'fixed',
  top: '50%',
  left: '50%',
  transform: 'translate(-50%, -50%)',
  zIndex: zIndex.dialogRaised,
  width: '760px',
  maxWidth: 'calc(100vw - 32px)',
  height: '560px',
  maxHeight: 'calc(100vh - 32px)',
  backgroundColor: vars.color.bgSecondary,
  border: `1px solid ${vars.color.border}`,
  borderRadius: vars.radius.lg,
  boxShadow: '0 16px 48px rgba(0,0,0,0.4)',
  animation: `${modalScaleIn} ${fast} ease`,
  display: 'flex',
  overflow: 'visible',
  '@media': {
    // Phones: a bottom-sheet host. The sheet (fullModalCard) sits at the bottom with room above it
    // for the frame art to hang over its top edge.
    [PANEL_OVERLAY_QUERY]: {
      flexDirection: 'column',
      justifyContent: 'flex-end',
      inset: 0,
      transform: 'none',
      width: '100%',
      maxWidth: '100%',
      height: '100%',
      maxHeight: 'none',
      backgroundColor: 'transparent',
      border: 'none',
      boxShadow: 'none',
      borderRadius: 0,
      animation: 'none',
      padding: 'calc(var(--safe-top) + 100px) 0 0',
    },
  },
});

const sheetUp = keyframes({
  from: { transform: 'translateY(100%)' },
  to: { transform: 'translateY(0)' },
});

/** Desktop: invisible (the frame belongs to the left pane). Phones: the bottom sheet the frame wraps. */
export const fullModalCard = style({
  display: 'contents',
  '@media': {
    [PANEL_OVERLAY_QUERY]: {
      display: 'flex',
      flexDirection: 'column',
      position: 'relative',
      width: '100%',
      flex: 1,
      minHeight: 0,
      animation: `${sheetUp} 260ms cubic-bezier(0.2, 0.9, 0.3, 1) both`,
    },
  },
});

/** Phones: the scrolling content of the sheet (clips to the rounded top; the frame is a sibling). */
export const fullModalScroll = style({
  display: 'contents',
  '@media': {
    [PANEL_OVERLAY_QUERY]: {
      display: 'block',
      flex: 1,
      minHeight: 0,
      overflowY: 'auto',
      overscrollBehavior: 'contain',
      backgroundColor: vars.color.bgSecondary,
      borderTopLeftRadius: '20px',
      borderTopRightRadius: '20px',
      paddingBottom: 'var(--safe-bottom)',
    },
  },
});

/** The drag pill over the banner (phones only). */
export const fullModalHandle = style({
  display: 'none',
  '@media': {
    [PANEL_OVERLAY_QUERY]: {
      display: 'block',
      position: 'absolute',
      top: '8px',
      left: '50%',
      transform: 'translateX(-50%)',
      width: '40px',
      height: '5px',
      borderRadius: vars.radius.pill,
      backgroundColor: 'rgba(255,255,255,0.85)',
      boxShadow: '0 0 4px rgba(0,0,0,0.4)',
      zIndex: zIndex.header,
      pointerEvents: 'none',
    },
  },
});

/**
 * Holds the left pane and its profile frame: the pane scrolls and clips, the frame is a sibling
 * so it can overhang the pane without being clipped (and never covers the right pane).
 */
export const fullModalLeftWrap = style({
  position: 'relative',
  display: 'flex',
  width: '300px',
  flexShrink: 0,
  '@media': {
    [PANEL_OVERLAY_QUERY]: {
      width: '100%',
    },
  },
});

export const fullModalLeft = style({
  flex: 1,
  minWidth: 0,
  borderTopLeftRadius: vars.radius.lg,
  borderBottomLeftRadius: vars.radius.lg,
  backgroundColor: vars.color.bgPrimary,
  borderRight: `1px solid ${vars.color.border}`,
  display: 'flex',
  flexDirection: 'column',
  position: 'relative',
  overflowY: 'auto',
  padding: '20px',
  gap: '14px',
  '@media': {
    [PANEL_OVERLAY_QUERY]: {
      width: '100%',
      overflowY: 'visible',
      borderRight: 'none',
      borderBottom: `1px solid ${vars.color.border}`,
      borderTopLeftRadius: '20px',
      borderTopRightRadius: '20px',
      borderBottomLeftRadius: 0,
    },
  },
});

export const fullModalRight = style({
  flex: 1,
  minWidth: 0,
  // The modal no longer clips, so the right pane rounds its own outer corners.
  borderTopRightRadius: vars.radius.lg,
  borderBottomRightRadius: vars.radius.lg,
  display: 'flex',
  flexDirection: 'column',
  position: 'relative',
  backgroundColor: vars.color.bgSecondary,
  '@media': {
    [PANEL_OVERLAY_QUERY]: {
      borderTopRightRadius: 0,
      borderBottomLeftRadius: 0,
      borderBottomRightRadius: 0,
    },
  },
});

export const fullModalHeader = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '12px 16px 0',
  borderBottom: `1px solid ${vars.color.border}`,
});

export const fullModalTabs = style({
  display: 'flex',
  gap: '8px',
});

export const fullModalTab = style({
  padding: '8px 12px',
  fontSize: fontSize.rem90,
  fontWeight: 600,
  color: vars.color.textSecondary,
  backgroundColor: 'transparent',
  border: 'none',
  borderBottom: '2px solid transparent',
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px',
  selectors: {
    '&:hover': {
      color: vars.color.textPrimary,
    },
    '&[aria-selected="true"]': {
      color: vars.color.textPrimary,
      borderBottomColor: vars.color.accent,
    },
  },
});

export const fullModalTabBadge = style({
  padding: '1px 6px',
  borderRadius: vars.radius.pill,
  backgroundColor: vars.color.bgTertiary,
  fontSize: fontSize.rem75,
  color: vars.color.textMuted,
});

export const fullModalCloseBtn = style({
  padding: '6px',
  borderRadius: '50%',
  backgroundColor: 'transparent',
  border: 'none',
  color: vars.color.textMuted,
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  selectors: {
    '&:hover': {
      backgroundColor: vars.color.bgHover,
      color: vars.color.textPrimary,
    },
  },
});

export const fullModalBody = style({
  flex: 1,
  padding: '16px',
  overflowY: 'auto',
  display: 'flex',
  flexDirection: 'column',
  gap: '12px',
  '@media': {
    // The whole sheet scrolls as one on phones.
    [PANEL_OVERLAY_QUERY]: { flex: 'none', overflowY: 'visible' },
  },
});

export const notesSection = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '6px',
});

export const notesLabel = style({
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
  fontSize: fontSize.rem75,
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.03em',
  color: vars.color.textMuted,
});

export const notesTextarea = style({
  width: '100%',
  minHeight: '60px',
  resize: 'vertical',
  padding: '8px 10px',
  borderRadius: vars.radius.sm,
  border: `1px solid ${vars.color.border}`,
  backgroundColor: vars.color.bgTertiary,
  color: vars.color.textPrimary,
  fontSize: fontSize.rem85,
  fontFamily: 'inherit',
  lineHeight: 1.4,
  selectors: {
    '&::placeholder': { color: vars.color.textMuted },
    '&:focus': { outline: 'none', borderColor: vars.color.accent },
  },
});

export const notesSaved = style({
  fontSize: fontSize.rem70,
  color: vars.color.textMuted,
  alignSelf: 'flex-end',
  opacity: 0,
  transition: `opacity ${fast}`,
  selectors: {
    '&[data-visible="true"]': { opacity: 1 },
  },
});

// Discord's phone profile only shows the top of the frame; the bottom piece is not drawn.
globalStyle(`${fullModalCard} .${profileFramePieceBottom}`, {
  '@media': { [PANEL_OVERLAY_QUERY]: { display: 'none' } },
});

/**
 * The link, soundboard-mute and ignore buttons beside the avatar sit on a banner of any colour, so
 * they have a dark disc behind them and a bright icon, and are bigger on touch screens.
 */
export const avatarActions = style({
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
  '@media': { '(pointer: coarse)': { gap: '8px' } },
});

globalStyle(`${avatarActions} button`, {
  width: '28px',
  height: '28px',
  borderRadius: '50%',
  backgroundColor: 'rgba(0, 0, 0, 0.5)',
  color: 'rgba(255, 255, 255, 0.95)',
  backdropFilter: 'blur(6px)',
  // Fingers get the bigger discs.
  '@media': { '(pointer: coarse)': { width: '34px', height: '34px' } },
});

globalStyle(`${avatarActions} button:hover:not(:disabled)`, {
  backgroundColor: 'rgba(0, 0, 0, 0.7)',
  color: '#fff',
});

globalStyle(`${avatarActions} button.${iconDanger}`, {
  color: '#ff8585',
});

globalStyle(`${avatarActions} button svg`, {
  width: '15px',
  height: '15px',
  '@media': { '(pointer: coarse)': { width: '18px', height: '18px' } },
});

export const coverEdit = style({
  position: 'absolute',
  top: '8px',
  right: '8px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '28px',
  height: '28px',
  borderRadius: '50%',
  backgroundColor: 'rgba(0,0,0,0.4)',
  color: 'rgba(255,255,255,0.9)',
  opacity: 0,
  transition: 'opacity 0.15s ease',
  cursor: 'pointer',
  selectors: {
    [`${popoutCoverWrap}:hover &`]: { opacity: 1 },
    [`${coverWrap}:hover &`]: { opacity: 1 },
  },
});

export const verifiedBadge = style({
  color: vars.color.success,
  display: 'flex',
  alignItems: 'center',
  flexShrink: 0,
});

export const detailRow = style({
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  fontSize: '0.82rem',
  color: vars.color.textMuted,
});

export const detailIcon = style({
  display: 'flex',
  alignItems: 'center',
  color: vars.color.textMuted,
  flexShrink: 0,
});

export const statusSlot = style({
  flex: 1,
  minWidth: 0,
  display: 'flex',
  alignItems: 'center',
});

export const status = style({
  position: 'relative',
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px',
  maxWidth: '100%',
  padding: '6px 10px',
  borderRadius: '8px',
  backgroundColor: vars.color.bgSecondary,
  border: `1px solid ${vars.color.border}`,
  fontSize: '0.78rem',
  lineHeight: 1.3,
  color: vars.color.textPrimary,
  '::before': {
    content: '""',
    position: 'absolute',
    left: '-4px',
    top: '50%',
    width: '7px',
    height: '7px',
    backgroundColor: vars.color.bgSecondary,
    borderLeft: `1px solid ${vars.color.border}`,
    borderBottom: `1px solid ${vars.color.border}`,
    transform: 'translateY(-50%) rotate(45deg)',
  },
});

export const statusText = style({
  minWidth: 0,
  display: '-webkit-box',
  WebkitLineClamp: 2,
  WebkitBoxOrient: 'vertical',
  overflow: 'hidden',
  overflowWrap: 'anywhere',
});

export const accountSwitcherSlot = style({
  paddingTop: '12px',
  borderTop: `1px solid ${vars.color.border}`,
});
