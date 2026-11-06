import { style } from '@vanilla-extract/css';
import { vars } from '@/theme/vars.css';

/**
 * Styles for the profile card extras (mutual rooms, status, badges, decoration, effects, bio).
 * `--card-accent` is set inline on the popup when the user picked an accent colour; every use
 * has a theme fallback, and text is never placed directly on the raw accent colour.
 */

const accentTint = (percent: number) =>
  `color-mix(in srgb, var(--card-accent, ${vars.color.bgTertiary}) ${percent}%, ${vars.color.bgTertiary})`;
const accentText = `color-mix(in srgb, var(--card-accent, ${vars.color.accent}) 65%, ${vars.color.textPrimary})`;

// --- Mutual rooms ----------------------------------------------------------------------------

export const mutualRow = style({
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
  width: '100%',
  padding: '8px 10px',
  borderRadius: vars.radius.sm,
  border: `1px solid ${vars.color.border}`,
  backgroundColor: vars.color.bgTertiary,
  color: vars.color.textPrimary,
  fontSize: '0.8rem',
  textAlign: 'left',
  cursor: 'pointer',
  selectors: {
    '&:hover': { backgroundColor: vars.color.bgHover },
    '&:focus-visible': { outline: `2px solid ${vars.color.accent}`, outlineOffset: '1px' },
  },
});

export const mutualAvatars = style({
  display: 'flex',
  alignItems: 'center',
  flexShrink: 0,
});

export const mutualAvatar = style({
  display: 'inline-flex',
  borderRadius: '50%',
  lineHeight: 0,
  boxShadow: `0 0 0 2px ${vars.color.bgTertiary}`,
  selectors: {
    '& + &': { marginLeft: '-6px' },
  },
});

export const mutualLabel = style({
  flex: 1,
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  fontWeight: 500,
});

export const mutualList = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '2px',
});

export const mutualHeading = style({
  margin: '8px 0 4px',
  fontSize: '0.75rem',
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  color: vars.color.textMuted,
  selectors: {
    '&:first-child': { marginTop: 0 },
  },
});

export const mutualItem = style({
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
  width: '100%',
  padding: '6px 8px',
  borderRadius: vars.radius.sm,
  border: '1px solid transparent',
  backgroundColor: 'transparent',
  color: vars.color.textPrimary,
  fontSize: '0.9rem',
  textAlign: 'left',
  cursor: 'pointer',
  selectors: {
    '&:hover': { backgroundColor: vars.color.bgTertiary },
    '&:focus-visible': { outline: `2px solid ${vars.color.accent}`, outlineOffset: '-2px' },
  },
});

export const mutualItemName = style({
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});

export const mutualNote = style({
  margin: 0,
  fontSize: '0.75rem',
  color: vars.color.textMuted,
});

// --- Status ----------------------------------------------------------------------------------

// A soft full-width row under the name, on its own line.
export const statusPill = style({
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  flexBasis: '100%',
  boxSizing: 'border-box',
  maxWidth: '100%',
  marginTop: '8px',
  padding: '7px 12px',
  borderRadius: vars.radius.md,
  fontSize: '0.85rem',
  lineHeight: 1.3,
  color: vars.color.textPrimary,
  backgroundColor: accentTint(14),
  border: `1px solid ${vars.color.border}`,
});

export const statusEmoji = style({
  flexShrink: 0,
  fontSize: '1rem',
  lineHeight: 1,
});

export const statusText = style({
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});

export const statusEmojiRow = style({
  display: 'flex',
  flexWrap: 'wrap',
  gap: '4px',
});

export const statusEmojiBtn = style({
  width: '32px',
  height: '32px',
  borderRadius: vars.radius.sm,
  border: `1px solid ${vars.color.border}`,
  backgroundColor: vars.color.bgTertiary,
  fontSize: '1.1rem',
  lineHeight: 1,
  cursor: 'pointer',
  selectors: {
    '&:hover': { backgroundColor: vars.color.bgHover },
    '&[aria-pressed="true"]': {
      borderColor: vars.color.accent,
      backgroundColor: vars.color.bgActive,
    },
  },
});

// --- Badges ----------------------------------------------------------------------------------

export const badgeRow = style({
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
  flexWrap: 'wrap',
});

/** The badge pinned to the top-right of a profile card's name block. */
export const badgeFloating = style({
  position: 'absolute',
  top: 0,
  right: 0,
});

export const badge = style({
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '24px',
  height: '24px',
  borderRadius: '50%',
  backgroundColor: vars.color.bgTertiary,
  border: `1px solid ${vars.color.border}`,
  cursor: 'default',
});

// --- Avatar decoration -----------------------------------------------------------------------

export const decorated = style({
  position: 'relative',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
});

export const decoration = style({
  position: 'absolute',
  top: '50%',
  left: '50%',
  transform: 'translate(-50%, -50%)',
  width: '120%',
  height: '120%',
  maxWidth: 'none',
  maxHeight: 'none',
  pointerEvents: 'none',
  userSelect: 'none',
  zIndex: 1,
});

// --- Profile effect --------------------------------------------------------------------------

export const effectCanvas = style({
  position: 'absolute',
  inset: 0,
  width: '100%',
  height: '100%',
  pointerEvents: 'none',
  zIndex: 5,
  borderRadius: 'inherit',
});

export const profileEffectContainer = style({
  position: 'absolute',
  inset: 0,
  width: '100%',
  height: '100%',
  pointerEvents: 'none',
  overflow: 'visible',
  zIndex: 10,
  borderRadius: 'inherit',
});

export const profileEffectLayer = style({
  position: 'absolute',
  top: 0,
  left: 0,
  width: '100%',
  height: '100%',
  // The art is a fixed tall shape (Discord's is about 450x880) and a card is rarely that shape, so it
  // is scaled to the card's width and cropped from the bottom, never stretched.
  objectFit: 'cover',
  objectPosition: 'top',
  pointerEvents: 'none',
  userSelect: 'none',
  maxWidth: 'none',
  maxHeight: 'none',
});

// --- Profile frame --------------------------------------------------------------------------

export const profileFrameContainer = style({
  position: 'absolute',
  inset: 0,
  width: '100%',
  height: '100%',
  pointerEvents: 'none',
  overflow: 'visible',
  borderRadius: 'inherit',
  containerType: 'inline-size',
});

export const profileFrameWrapper = style({
  position: 'absolute',
  top: 0,
  height: '100%',
  left: 'calc(var(--custom-profile-frame-scaled-overflow-horizontal, clamp(12px, calc(100cqw * 0.0467), 18px)) * -1)',
  width:
    'calc(100% + var(--custom-profile-frame-scaled-overflow-horizontal, clamp(12px, calc(100cqw * 0.0467), 18px)) * 2)',
  pointerEvents: 'none',
  overflow: 'visible',
});

export const profileFrameLayerBack = style({
  position: 'absolute',
  inset: 0,
  zIndex: 0,
  pointerEvents: 'none',
  overflow: 'visible',
});

export const profileFrameLayerFront = style({
  position: 'absolute',
  inset: 0,
  zIndex: 12,
  pointerEvents: 'none',
  overflow: 'visible',
});

export const profileFramePiece = style({
  position: 'absolute',
  left: 0,
  width: '100%',
  display: 'block',
  pointerEvents: 'none',
  userSelect: 'none',
  maxWidth: 'none',
});

export const profileFramePieceTop = style({
  top: 'calc(var(--custom-profile-frame-scaled-overflow-top, clamp(48px, calc(100cqw * 0.2), 85px)) * -1)',
  bottom: 'auto',
  height: 'auto',
  objectPosition: 'top',
  filter: 'drop-shadow(0 -8px 16px rgba(0, 0, 0, 0.35))',
});

export const profileFramePieceBottom = style({
  bottom:
    'calc(var(--custom-profile-frame-scaled-overflow-bottom, clamp(24px, calc(100cqw * 0.12), 56px)) * -1)',
  top: 'auto',
  height: 'auto',
  objectPosition: 'bottom',
  filter: 'drop-shadow(0 8px 16px rgba(0, 0, 0, 0.35))',
});

export const profileFramePieceCenter = style({
  top: 0,
  height: '100%',
  objectFit: 'fill',
});

// --- Nameplate -------------------------------------------------------------------------------

export const nameplateWrapper = style({
  position: 'relative',
  display: 'inline-flex',
  alignItems: 'center',
  borderRadius: vars.radius.md,
  padding: '3px 10px',
  overflow: 'hidden',
  maxWidth: '100%',
  verticalAlign: 'middle',
});

export const nameplateBg = style({
  position: 'absolute',
  inset: 0,
  width: '100%',
  height: '100%',
  objectFit: 'cover',
  objectPosition: 'center',
  pointerEvents: 'none',
  userSelect: 'none',
  zIndex: 0,
});

export const nameplateContent = style({
  position: 'relative',
  zIndex: 1,
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px',
  textShadow: '0 1px 3px rgba(0, 0, 0, 0.75)',
});

// --- Bio -------------------------------------------------------------------------------------

export const bioPlain = style({
  display: 'flex',
  flexDirection: 'column',
  fontSize: '0.84rem',
  color: vars.color.textPrimary,
  lineHeight: 1.45,
  whiteSpace: 'pre-wrap',
  overflowWrap: 'anywhere',
});

export const bioBox = style({
  display: 'flex',
  flexDirection: 'column',
  fontSize: '0.85rem',
  color: vars.color.textPrimary,
  lineHeight: 1.45,
  whiteSpace: 'pre-wrap',
  overflowWrap: 'anywhere',
  padding: '8px 10px',
  borderRadius: vars.radius.sm,
  backgroundColor: vars.color.bgTertiary,
  border: `1px solid ${vars.color.border}`,
  borderLeft: `3px solid var(--card-accent, ${vars.color.border})`,
});

export const bioClamped = style({
  display: '-webkit-box',
  WebkitLineClamp: 3,
  WebkitBoxOrient: 'vertical',
  overflow: 'hidden',
});

export const viewBioButton = style({
  alignSelf: 'flex-start',
  marginTop: '4px',
  padding: 0,
  border: 'none',
  background: 'none',
  color: accentText,
  fontSize: '0.8rem',
  fontWeight: 600,
  cursor: 'pointer',
  selectors: {
    '&:hover': { textDecoration: 'underline' },
    '&:focus-visible': { outline: `2px solid ${vars.color.accent}`, outlineOffset: '2px' },
  },
});

export const fullBio = style({
  fontSize: '0.9rem',
  color: vars.color.textPrimary,
  lineHeight: 1.5,
  whiteSpace: 'pre-wrap',
  overflowWrap: 'anywhere',
});

// --- Accent-aware card chrome ----------------------------------------------------------------

/** Fades the banner image into the card; tinted with the accent when one is set. */
export const coverTint = style({
  position: 'absolute',
  inset: 0,
  pointerEvents: 'none',
  background: `linear-gradient(to bottom, transparent 55%, color-mix(in srgb, var(--card-accent, transparent) 35%, transparent))`,
});

export const memberSince = style({
  color: vars.color.textPrimary,
  fontWeight: 500,
});

export const verificationOk = style({
  color: vars.color.success,
  fontWeight: 500,
});

export const verificationWarning = style({
  color: vars.color.danger,
  fontWeight: 500,
});

export const activityCard = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '8px',
  padding: '12px 14px',
  borderRadius: vars.radius.sm,
  backgroundColor: vars.color.bgTertiary,
  border: `1px solid ${vars.color.border}`,
});

export const activityCardTitle = style({
  fontSize: '0.75rem',
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.03em',
  color: vars.color.textMuted,
});

export const activityQuote = style({
  margin: 0,
  padding: '0 0 0 10px',
  borderLeft: `3px solid var(--card-accent, ${vars.color.border})`,
  fontSize: '0.88rem',
  fontStyle: 'italic',
  color: vars.color.textPrimary,
  lineHeight: 1.4,
  whiteSpace: 'pre-wrap',
  overflowWrap: 'anywhere',
});

export const activityMeta = style({
  fontSize: '0.78rem',
  color: vars.color.textMuted,
});

export const verifyButton = style({
  marginLeft: 'auto',
  padding: '2px 10px',
  borderRadius: vars.radius.sm,
  border: `1px solid ${vars.color.border}`,
  backgroundColor: 'transparent',
  color: vars.color.textPrimary,
  fontSize: '12px',
  cursor: 'pointer',
  ':hover': { backgroundColor: vars.color.bgHover },
  ':disabled': { opacity: 0.5, cursor: 'default' },
});
