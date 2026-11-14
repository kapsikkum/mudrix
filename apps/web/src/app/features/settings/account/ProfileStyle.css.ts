import { style } from '@vanilla-extract/css';
import { vars } from '@/theme/vars.css';
import { scaleIn, fast } from '@/theme/animations.css';
import { zIndex } from '@/theme/zIndex';
import { fontSize } from '@/theme/typeScale';

export const group = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '20px',
  paddingTop: '16px',
  borderTop: `1px solid ${vars.color.border}`,
});

export const headerRow = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '4px',
});

export const groupTitle = style({
  margin: 0,
  fontSize: fontSize.rem105,
  fontWeight: 700,
  color: vars.color.textPrimary,
});

export const mudrixBadge = style({
  display: 'inline-block',
  marginLeft: '8px',
  padding: '1px 8px',
  borderRadius: vars.radius.pill,
  fontSize: fontSize.rem70,
  fontWeight: 600,
  color: vars.color.textSecondary,
  backgroundColor: vars.color.bgTertiary,
  border: `1px solid ${vars.color.border}`,
  verticalAlign: 'middle',
});

export const note = style({
  margin: 0,
  fontSize: fontSize.rem82,
  color: vars.color.textMuted,
  lineHeight: 1.5,
});

export const customizerLayout = style({
  display: 'flex',
  gap: '20px',
  alignItems: 'flex-start',
  '@media': {
    'screen and (max-width: 900px)': {
      flexDirection: 'column',
    },
  },
});

export const editorCol = style({
  flex: '1 1 260px',
  minWidth: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: '18px',
});

export const previewCol = style({
  flex: '0 0 280px',
  width: '280px',
  position: 'sticky',
  top: '20px',
  display: 'flex',
  flexDirection: 'column',
  gap: '10px',
  overflow: 'visible',
  '@media': {
    'screen and (max-width: 900px)': {
      position: 'static',
      width: '100%',
      maxWidth: '300px',
      margin: '0 auto',
    },
  },
});

export const previewHeading = style({
  fontSize: fontSize.rem75,
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  color: vars.color.textMuted,
  margin: 0,
});

/* --- Preview Window Card (Discord User Popout Replica) --- */

export const previewCard = style({
  position: 'relative',
  borderRadius: '16px',
  backgroundColor: vars.color.bgPrimary,
  border: `1px solid ${vars.color.border}`,
  boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
  display: 'flex',
  flexDirection: 'column',
  overflow: 'visible',
  width: '100%',
});

export const previewBannerWrap = style({
  position: 'relative',
  height: '110px',
  width: '100%',
  backgroundColor: vars.color.bgTertiary,
  flexShrink: 0,
  borderTopLeftRadius: '15px',
  borderTopRightRadius: '15px',
  overflow: 'hidden',
});

export const previewBanner = style({
  position: 'absolute',
  inset: 0,
  width: '100%',
  height: '100%',
  objectFit: 'cover',
});

export const previewBannerFallback = style({
  position: 'absolute',
  inset: 0,
  width: '100%',
  height: '100%',
});

export const previewAvatarRow = style({
  position: 'relative',
  marginTop: '-42px',
  paddingLeft: '16px',
  display: 'flex',
  alignItems: 'center',
  zIndex: zIndex.above,
});

export const previewAvatarWrap = style({
  position: 'relative',
  padding: '5px',
  borderRadius: '50%',
  backgroundColor: vars.color.bgPrimary,
  lineHeight: 0,
  display: 'inline-flex',
  boxShadow: `0 0 0 1px ${vars.color.border}`,
});

export const previewBody = style({
  margin: '12px 14px 14px',
  padding: '12px 14px',
  borderRadius: vars.radius.md,
  backgroundColor: vars.color.bgSecondary,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'flex-start',
  gap: '4px',
  zIndex: zIndex.above,
  position: 'relative',
});

export const previewDisplayName = style({
  fontSize: '1.15rem',
  fontWeight: 700,
  color: vars.color.textPrimary,
  lineHeight: 1.25,
  wordBreak: 'break-word',
});

export const previewUserId = style({
  fontSize: fontSize.rem80,
  color: vars.color.textMuted,
});

export const previewPronouns = style({
  fontSize: fontSize.rem78,
  color: vars.color.textSecondary,
});

export const previewDivider = style({
  width: '100%',
  height: '1px',
  backgroundColor: vars.color.border,
  margin: '8px 0',
});

export const previewSectionHeader = style({
  fontSize: fontSize.rem72,
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  color: vars.color.textMuted,
  marginBottom: '2px',
});

export const previewBio = style({
  fontSize: fontSize.rem82,
  color: vars.color.textPrimary,
  lineHeight: 1.45,
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
});

/* --- Editor Controls --- */

export const cosmeticCard = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '10px',
  padding: '12px 14px',
  borderRadius: vars.radius.md,
  backgroundColor: vars.color.bgTertiary,
  border: `1px solid ${vars.color.border}`,
});

export const cosmeticHeader = style({
  display: 'flex',
  alignItems: 'center',
  gap: '12px',
  minWidth: 0,
});

export const cosmeticThumbCircle = style({
  position: 'relative',
  width: '44px',
  height: '44px',
  borderRadius: '50%',
  backgroundColor: vars.color.bgSecondary,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
});

export const cosmeticThumbSquare = style({
  position: 'relative',
  width: '44px',
  height: '44px',
  borderRadius: vars.radius.sm,
  backgroundColor: vars.color.bgSecondary,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
  overflow: 'hidden',
});

export const cosmeticThumbImg = style({
  width: '100%',
  height: '100%',
  objectFit: 'contain',
});

export const cosmeticDetails = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '2px',
  minWidth: 0,
  flex: 1,
});

export const cosmeticName = style({
  fontSize: fontSize.rem90,
  fontWeight: 600,
  color: vars.color.textPrimary,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});

export const cosmeticMeta = style({
  fontSize: fontSize.rem75,
  color: vars.color.textMuted,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});

export const cosmeticActions = style({
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  flexWrap: 'wrap',
});

/* --- Accent Swatches & Input --- */

export const swatches = style({
  display: 'flex',
  flexWrap: 'wrap',
  gap: '8px',
  marginBottom: '10px',
});

export const swatch = style({
  width: '28px',
  height: '28px',
  borderRadius: '50%',
  border: '2px solid transparent',
  cursor: 'pointer',
  padding: 0,
  boxShadow: `inset 0 0 0 1px rgba(0,0,0,0.25)`,
  selectors: {
    '&[aria-pressed="true"]': {
      borderColor: vars.color.textPrimary,
      outline: `2px solid ${vars.color.bgSecondary}`,
      outlineOffset: '-4px',
    },
    '&:focus-visible': { outline: `2px solid ${vars.color.accent}`, outlineOffset: '2px' },
  },
});

export const colorInputRow = style({
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  flexWrap: 'wrap',
});

export const colorInput = style({
  width: '36px',
  height: '28px',
  padding: 0,
  border: `1px solid ${vars.color.border}`,
  borderRadius: vars.radius.sm,
  backgroundColor: 'transparent',
  cursor: 'pointer',
});

export const hexInput = style({
  width: '110px',
  fontFamily: 'monospace',
});

export const accentPreview = style({
  display: 'inline-flex',
  alignItems: 'center',
  padding: '4px 12px',
  borderRadius: vars.radius.sm,
  fontSize: fontSize.rem80,
  fontWeight: 600,
});

/* --- Badges --- */

export const badgeRow = style({
  display: 'flex',
  flexWrap: 'wrap',
  gap: '8px',
});

export const badgeOption = style({
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px',
  padding: '6px 12px',
  borderRadius: vars.radius.pill,
  border: `1px solid ${vars.color.border}`,
  backgroundColor: vars.color.bgTertiary,
  color: vars.color.textPrimary,
  fontSize: fontSize.rem85,
  cursor: 'pointer',
  transition: `border-color ${fast}, background-color ${fast}`,
  selectors: {
    '&:hover': { backgroundColor: vars.color.bgHover },
    '&[aria-pressed="true"]': {
      borderColor: vars.color.accent,
      backgroundColor: vars.color.bgActive,
    },
    '&:disabled': { opacity: 0.5, cursor: 'not-allowed' },
  },
});

export const statusRow = style({
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  gap: '10px',
});

/* --- Modal Grid Pickers --- */

export const modalFilterRow = style({
  display: 'flex',
  gap: '10px',
  marginBottom: '10px',
  flexWrap: 'wrap',
  alignItems: 'center',
});

export const modalActionsRow = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '8px',
  flexWrap: 'wrap',
  marginBottom: '14px',
});

export const modalButtons = style({
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  flexWrap: 'wrap',
});

export const decorationOptionWrap = style({
  position: 'relative',
  display: 'flex',
  flexDirection: 'column',
});

export const deleteCustomBtn = style({
  position: 'absolute',
  top: '3px',
  right: '3px',
  width: '18px',
  height: '18px',
  borderRadius: '50%',
  backgroundColor: 'rgba(0, 0, 0, 0.65)',
  color: vars.color.textMuted,
  border: 'none',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
  zIndex: zIndex.above,
  padding: 0,
  transition: `background-color ${fast}, color ${fast}`,
  selectors: {
    '&:hover': {
      backgroundColor: vars.color.danger,
      color: '#ffffff',
    },
  },
});

export const modalSearch = style({
  flex: '1 1 200px',
});

export const modalCategorySelect = style({
  flex: '1 1 180px',
});

export const modalCount = style({
  fontSize: fontSize.rem75,
  color: vars.color.textMuted,
  marginLeft: 'auto',
});

export const modalScrollArea = style({
  maxHeight: '440px',
  overflowY: 'auto',
  padding: '4px',
  margin: '-4px',
});

export const decorationGrid = style({
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(96px, 1fr))',
  gap: '10px',
});

export const decorationOption = style({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: '6px',
  padding: '8px 4px',
  borderRadius: vars.radius.sm,
  border: `1px solid ${vars.color.border}`,
  backgroundColor: vars.color.bgTertiary,
  color: vars.color.textSecondary,
  fontSize: fontSize.rem70,
  cursor: 'pointer',
  transition: `border-color ${fast}, background-color ${fast}`,
  selectors: {
    '&:hover': { backgroundColor: vars.color.bgHover },
    '&[aria-pressed="true"]': {
      borderColor: vars.color.accent,
      backgroundColor: vars.color.bgActive,
      color: vars.color.textPrimary,
    },
    '&:disabled': { opacity: 0.5, cursor: 'not-allowed' },
  },
});

export const decorationPreview = style({
  position: 'relative',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '44px',
  height: '44px',
  margin: '4px',
});

export const decorationPreviewAvatar = style({
  position: 'absolute',
  inset: 0,
  borderRadius: '50%',
  backgroundColor: vars.color.bgHover,
});

export const decorationLabel = style({
  width: '100%',
  textAlign: 'center',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  padding: '0 4px',
  fontSize: fontSize.rem70,
  lineHeight: 1.2,
});

export const effectGrid = style({
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))',
  gap: '12px',
});

export const effectOption = style({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: '8px',
  padding: '10px 8px',
  borderRadius: vars.radius.sm,
  border: `1px solid ${vars.color.border}`,
  backgroundColor: vars.color.bgTertiary,
  color: vars.color.textSecondary,
  cursor: 'pointer',
  transition: `border-color ${fast}, background-color ${fast}`,
  selectors: {
    '&:hover': { backgroundColor: vars.color.bgHover },
    '&[aria-pressed="true"]': {
      borderColor: vars.color.accent,
      backgroundColor: vars.color.bgActive,
      color: vars.color.textPrimary,
    },
    '&:disabled': { opacity: 0.5, cursor: 'not-allowed' },
  },
});

export const effectOptionThumb = style({
  width: '72px',
  height: '72px',
  objectFit: 'contain',
  borderRadius: vars.radius.sm,
  backgroundColor: vars.color.bgSecondary,
});

export const effectOptionTitle = style({
  width: '100%',
  textAlign: 'center',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  fontSize: fontSize.rem78,
  fontWeight: 600,
  color: vars.color.textPrimary,
});

export const effectOptionCategory = style({
  width: '100%',
  textAlign: 'center',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  fontSize: fontSize.rem68,
  color: vars.color.textMuted,
});

/* --- Nameplate & Frame Grids --- */

export const nameplateGrid = style({
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
  gap: '12px',
});

export const nameplateOption = style({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: '8px',
  padding: '10px 8px',
  borderRadius: vars.radius.sm,
  border: `1px solid ${vars.color.border}`,
  backgroundColor: vars.color.bgTertiary,
  color: vars.color.textSecondary,
  cursor: 'pointer',
  transition: `border-color ${fast}, background-color ${fast}`,
  selectors: {
    '&:hover': { backgroundColor: vars.color.bgHover },
    '&[aria-pressed="true"]': {
      borderColor: vars.color.accent,
      backgroundColor: vars.color.bgActive,
      color: vars.color.textPrimary,
    },
    '&:disabled': { opacity: 0.5, cursor: 'not-allowed' },
  },
});

export const nameplateOptionPlate = style({
  width: '100%',
  height: '40px',
  borderRadius: vars.radius.md,
  position: 'relative',
  overflow: 'hidden',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
});

export const frameGrid = style({
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))',
  gap: '12px',
});

export const frameOption = style({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: '8px',
  padding: '10px 8px',
  borderRadius: vars.radius.sm,
  border: `1px solid ${vars.color.border}`,
  backgroundColor: vars.color.bgTertiary,
  color: vars.color.textSecondary,
  cursor: 'pointer',
  transition: `border-color ${fast}, background-color ${fast}`,
  selectors: {
    '&:hover': { backgroundColor: vars.color.bgHover },
    '&[aria-pressed="true"]': {
      borderColor: vars.color.accent,
      backgroundColor: vars.color.bgActive,
      color: vars.color.textPrimary,
    },
    '&:disabled': { opacity: 0.5, cursor: 'not-allowed' },
  },
});

export const frameOptionThumb = style({
  width: '76px',
  height: '96px',
  position: 'relative',
  borderRadius: vars.radius.sm,
  backgroundColor: vars.color.bgSecondary,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  overflow: 'visible',
});

/* --- Floating Save Bar --- */

export const floatingSaveBar = style({
  position: 'sticky',
  bottom: '16px',
  zIndex: zIndex.pinned,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '16px',
  padding: '12px 20px',
  borderRadius: vars.radius.md,
  backgroundColor: vars.color.bgPrimary,
  border: `1px solid ${vars.color.border}`,
  boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
  animation: `${scaleIn} ${fast} ease`,
});

export const floatingSaveText = style({
  fontSize: fontSize.rem88,
  fontWeight: 600,
  color: vars.color.textPrimary,
});

export const floatingSaveActions = style({
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
});

// ---------- badges ----------

export const badgeList = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '8px',
});

export const badgeItem = style({
  display: 'flex',
  alignItems: 'center',
  gap: '12px',
  padding: '10px 12px',
  borderRadius: vars.radius.md,
  border: `1px solid ${vars.color.border}`,
  backgroundColor: vars.color.bgPrimary,
});

export const badgeIcon = style({
  display: 'flex',
  flexShrink: 0,
});

export const badgeText = style({
  flex: 1,
  minWidth: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: '2px',
});

export const badgeTitle = style({
  fontSize: fontSize.rem90,
  fontWeight: 600,
  color: vars.color.textPrimary,
});

export const badgeHint = style({
  fontSize: fontSize.rem80,
  lineHeight: 1.4,
  color: vars.color.textMuted,
});

export const badgeAuto = style({
  flexShrink: 0,
  padding: '2px 8px',
  borderRadius: vars.radius.pill,
  fontSize: fontSize.rem72,
  fontWeight: 600,
  color: vars.color.textMuted,
  backgroundColor: vars.color.bgTertiary,
});

export const grid = style({
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))',
  gap: '8px',
});

export const tile = style({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '6px',
  padding: '10px 8px',
  borderRadius: vars.radius.sm,
  border: `1px solid ${vars.color.border}`,
  backgroundColor: vars.color.bgTertiary,
  color: vars.color.textSecondary,
  fontSize: fontSize.rem75,
  fontWeight: 600,
  cursor: 'pointer',
  transition: `border-color ${fast}, background-color ${fast}`,
  selectors: {
    '&:hover': { backgroundColor: vars.color.bgHover },
    '&[aria-pressed="true"]': {
      borderColor: vars.color.accent,
      backgroundColor: vars.color.bgActive,
      color: vars.color.textPrimary,
    },
    '&:disabled': { opacity: 0.5, cursor: 'not-allowed' },
  },
});

export const tileImage = style({
  width: '56px',
  height: '56px',
  objectFit: 'contain',
  pointerEvents: 'none',
});

export const tileWide = style({
  width: '100%',
  height: '28px',
  objectFit: 'cover',
  borderRadius: '4px',
  pointerEvents: 'none',
});
