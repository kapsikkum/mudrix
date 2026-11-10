import { PANEL_OVERLAY_QUERY } from '@/const/breakpoints';
import { globalStyle, keyframes, style } from '@vanilla-extract/css';
import { vars } from '@/theme/vars.css';
import { fast } from '@/theme/animations.css';
import { zIndex } from '@/theme/zIndex';
import { fontSize } from '@/theme/typeScale';

export const dialogBody = style({
  selectors: {
    '&&': {
      padding: 0,
      gap: 0,
      overflow: 'hidden',
      flexDirection: 'row',
    },
  },
});

export const nav = style({
  width: '220px',
  backgroundColor: vars.color.bgPrimary,
  borderRight: `1px solid ${vars.color.border}`,
  display: 'flex',
  flexDirection: 'column',
  padding: '12px 8px',
  gap: '2px',
  overflowY: 'auto',
  flexShrink: 0,
  '@media': {
    [PANEL_OVERLAY_QUERY]: { width: '56px' },
  },
});

export const navLabel = style({
  padding: '8px 10px',
  fontSize: fontSize.rem80,
  fontWeight: 700,
  color: vars.color.textMuted,
  letterSpacing: '0.01em',
  '@media': {
    [PANEL_OVERLAY_QUERY]: {
      display: 'none',
    },
  },
});

export const navLabelText = style({
  '@media': {
    [PANEL_OVERLAY_QUERY]: {
      display: 'none',
    },
  },
});

export const navItem = style({
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
  padding: '9px 12px',
  borderRadius: vars.radius.sm,
  cursor: 'pointer',
  border: 'none',
  background: 'none',
  color: vars.color.textMuted,
  fontSize: fontSize.rem90,
  fontWeight: 500,
  transition: `background-color ${fast}, color ${fast}`,
  textAlign: 'left',
  width: '100%',
  ':hover': {
    backgroundColor: vars.color.bgHover,
    color: vars.color.textPrimary,
  },
});

export const navItemActive = style([
  navItem,
  {
    backgroundColor: vars.color.bgActive,
    color: vars.color.textPrimary,
    ':hover': {
      backgroundColor: vars.color.bgActive,
      color: vars.color.textPrimary,
    },
  },
]);

// The page scrolls inside `scroller`; the close button and the page title stay put above it.
export const content = style({
  flex: 1,
  minWidth: 0,
  overflow: 'hidden',
  position: 'relative',
  backgroundColor: vars.color.bgSecondary,
  color: vars.color.textPrimary,
});

export const scroller = style({
  height: '100%',
  overflowY: 'auto',
  padding: '32px 40px',
  '@media': {
    [PANEL_OVERLAY_QUERY]: { padding: '16px' },
  },
});

export const closeBtn = style({
  position: 'absolute',
  zIndex: zIndex.above,
  top: '16px',
  right: '20px',
  width: '32px',
  height: '32px',
  borderRadius: vars.radius.sm,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
  border: 'none',
  background: 'none',
  color: vars.color.textMuted,
  fontSize: fontSize.rem100,
  transition: `background-color ${fast}, color ${fast}`,
  ':hover': {
    backgroundColor: vars.color.bgHover,
    color: vars.color.textPrimary,
  },
});

// A bar that sticks to the top of the scrolling page, level with the close button.
export const panelTitle = style({
  position: 'sticky',
  top: '-32px',
  zIndex: zIndex.lifted,
  display: 'flex',
  alignItems: 'center',
  minHeight: '64px',
  margin: '-32px -40px 12px',
  padding: '0 72px 0 40px',
  fontSize: fontSize.rem160,
  fontWeight: 700,
  color: vars.color.textPrimary,
  letterSpacing: '-0.01em',
  backgroundColor: vars.color.bgSecondary,
  borderBottom: `1px solid ${vars.color.border}`,
  cursor: 'text',
  '@media': {
    [PANEL_OVERLAY_QUERY]: { top: '-16px', margin: '-16px -16px 12px', padding: '0 64px 0 16px' },
  },
});

export const section = style({
  marginBottom: '24px',
});

export const sectionTitle = style({
  fontSize: fontSize.rem100,
  fontWeight: 700,
  color: vars.color.textMuted,
  letterSpacing: '0.01em',
  marginBottom: '10px',
  cursor: 'text',
});

export const divider = style({
  height: '1px',
  backgroundColor: vars.color.border,
  margin: '24px 0',
  selectors: {
    '& + &': { display: 'none' },
  },
});

export const avatarRow = style({
  display: 'flex',
  alignItems: 'flex-start',
  gap: '16px',
  marginBottom: '4px',
  '@media': {
    // Avatar on top, fields below at full width.
    [PANEL_OVERLAY_QUERY]: { flexDirection: 'column-reverse', alignItems: 'stretch' },
  },
});

export const avatarClickable = style({
  cursor: 'pointer',
  position: 'relative',
  borderRadius: '50%',
  flexShrink: 0,
});

export const avatarOverlay = style({
  position: 'absolute',
  inset: 0,
  borderRadius: '50%',
  backgroundColor: 'rgba(0,0,0,0.4)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  opacity: 0,
  transition: `opacity ${fast}`,
  ':hover': { opacity: 1 },
});

export const iconBefore = style({
  marginRight: '6px',
});

export const fieldGroup = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '16px',
});

export const profileFields = style({
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  gap: '16px',
  minWidth: 0,
});

export const avatarUploadWrap = style({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: '8px',
});

export const avatarPreviewImg = style({
  width: '72px',
  height: '72px',
  borderRadius: '50%',
  objectFit: 'cover',
});

export const hiddenInput = style({
  display: 'none',
});

export const whiteIcon = style({
  color: '#fff',
});

export const settingRow = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '12px 0',
  gap: '16px',
});

export const settingRowClickable = style({
  cursor: 'pointer',
});

export const settingInfo = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '2px',
});

export const settingLabel = style({
  fontSize: fontSize.rem95,
  fontWeight: 500,
  color: vars.color.textPrimary,
  lineHeight: 1.4,
});

export const settingNote = style({
  fontSize: fontSize.rem82,
  color: vars.color.textMuted,
  lineHeight: 1.5,
});

export const tokenRow = style({
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
});

export const tokenField = style({
  flex: 1,
  backgroundColor: vars.color.bgTertiary,
  border: `1px solid ${vars.color.border}`,
  borderRadius: vars.radius.sm,
  padding: '8px 12px',
  fontSize: fontSize.rem82,
  fontFamily: 'monospace',
  wordBreak: 'break-all',
  color: vars.color.textMuted,
});

export const actions = style({
  display: 'flex',
  gap: '8px',
  marginTop: '8px',
});

export const flexRow = style({
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
});

export const flexRowWrap = style({
  display: 'flex',
  alignItems: 'flex-end',
  gap: '12px',
  width: '100%',
});

export const flexOne = style({
  flex: 1,
});

export const permSearchRow = style({
  display: 'flex',
  gap: '8px',
  alignItems: 'flex-end',
  marginBottom: '12px',
});

export const permSearchWrap = style({
  flex: 1,
  minWidth: 0,
});

export const permResults = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '4px',
  maxHeight: '260px',
  overflowY: 'auto',
  border: `1px solid ${vars.color.border}`,
  borderRadius: vars.radius.md,
  backgroundColor: vars.color.bgSecondary,
  padding: '8px',
});

export const noResults = style({
  padding: '16px',
  textAlign: 'center',
  color: vars.color.textMuted,
  fontSize: fontSize.rem85,
});

export const permGroupHeader = style({
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  padding: '16px 10px 6px',
  fontSize: fontSize.rem100,
  fontWeight: 700,
  color: vars.color.textMuted,
  letterSpacing: '0.01em',
  borderTop: `1px solid ${vars.color.border}`,
  marginTop: '4px',
  ':first-child': {
    borderTop: 'none',
    marginTop: 0,
  },
});

export const permGroupBadge = style({
  fontSize: fontSize.rem70,
  fontWeight: 600,
  padding: '1px 7px',
  borderRadius: '10px',
  backgroundColor: vars.color.bgHover,
  color: vars.color.textMuted,
});

export const permShowMore = style({
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
  padding: '6px 10px',
  fontSize: fontSize.rem82,
  color: vars.color.accent,
  cursor: 'pointer',
  border: 'none',
  background: 'none',
  width: '100%',
  textAlign: 'left',
  borderRadius: vars.radius.sm,
  ':hover': { backgroundColor: vars.color.bgHover },
});

export const permRow = style({
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
  padding: '8px 10px',
  borderRadius: vars.radius.sm,
  transition: `background-color ${fast}`,
  ':hover': { backgroundColor: vars.color.bgHover },
});

export const permRowName = style({
  flex: 1,
  minWidth: 0,
  fontSize: fontSize.rem88,
  color: vars.color.textPrimary,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});

/** The role at the end of a member row. */
export const permRowRole = style({
  marginLeft: 'auto',
  flexShrink: 0,
  fontSize: fontSize.rem80,
  color: vars.color.textMuted,
});

export const permRowId = style({
  fontSize: fontSize.rem72,
  color: vars.color.textMuted,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  maxWidth: '140px',
  display: 'none',
  '@media': {
    '(min-width: 768px)': { display: 'block' },
  },
});

export const dialogBodyColumn = style({
  selectors: { '&&': { flexDirection: 'column' } },
});

export const navList = style({
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  minHeight: 0,
  overflowY: 'auto',
  backgroundColor: vars.color.bgSecondary,
  paddingBottom: '16px',
});

export const navListHeader = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  minHeight: '56px',
  padding: '8px 8px 8px 16px',
});

export const navListTitle = style({
  fontSize: '1.3rem',
  fontWeight: 700,
  color: vars.color.textPrimary,
});

export const navListDivider = style({
  height: '1px',
  margin: '8px 16px',
  backgroundColor: vars.color.border,
});

export const navRow = style({
  display: 'flex',
  alignItems: 'center',
  gap: '14px',
  width: '100%',
  minHeight: '52px',
  padding: '0 16px',
  border: 'none',
  background: 'none',
  color: vars.color.textPrimary,
  fontFamily: 'inherit',
  fontSize: '1rem',
  fontWeight: 500,
  textAlign: 'left',
  cursor: 'pointer',
  transition: `background-color ${fast}`,
  ':hover': { backgroundColor: vars.color.bgHover },
  ':active': { backgroundColor: vars.color.bgActive },
});

export const navListFooter = style({
  marginTop: 'auto',
  padding: '16px 16px 0',
});

export const accountCard = style({
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
  width: '100%',
  padding: '8px 10px',
  border: `1px solid ${vars.color.border}`,
  borderRadius: vars.radius.md,
  backgroundColor: vars.color.bgSecondary,
  color: vars.color.textPrimary,
  fontFamily: 'inherit',
  textAlign: 'left',
  cursor: 'pointer',
  transition: `background-color ${fast}`,
  ':hover': { backgroundColor: vars.color.bgHover },
});

export const accountCardText = style({
  display: 'flex',
  flexDirection: 'column',
  flex: 1,
  minWidth: 0,
});

const ellipsis = {
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
} as const;

export const accountCardName = style({ ...ellipsis, fontSize: '0.9rem', fontWeight: 600 });

export const accountCardCaret = style({ flexShrink: 0, color: vars.color.textMuted });

export const inlineActions = style({
  display: 'flex',
  gap: '8px',
  flexShrink: 0,
});

export const navRowIcon = style({
  display: 'flex',
  flexShrink: 0,
  color: vars.color.textMuted,
});

export const navRowLabel = style({
  flex: 1,
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});

export const navRowCaret = style({
  flexShrink: 0,
  color: vars.color.textMuted,
});

export const pageHeader = style({
  display: 'flex',
  alignItems: 'center',
  gap: '4px',
  height: '56px',
  padding: '0 8px',
  flexShrink: 0,
  borderBottom: `1px solid ${vars.color.border}`,
  backgroundColor: vars.color.bgSecondary,
  color: vars.color.textPrimary,
});

export const pageHeaderTitle = style({
  flex: 1,
  minWidth: 0,
  fontSize: fontSize.rem110,
  fontWeight: 700,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  padding: '0 8px',
  color: vars.color.textPrimary,
});

export const headerIconBtn = style({
  width: '44px',
  height: '44px',
  borderRadius: '50%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  border: 'none',
  background: 'none',
  color: vars.color.textPrimary,
  cursor: 'pointer',
  selectors: { '&:active': { backgroundColor: vars.color.bgHover } },
});

export const narrowPage = style({
  flex: 1,
  overflowY: 'auto',
  padding: '16px 16px calc(24px + var(--safe-bottom, 0px))',
  color: vars.color.textPrimary,
});
globalStyle(`${narrowPage} ${panelTitle}`, { display: 'none' });

export const navSearch = style({
  padding: '0 2px 6px',
});

export const navListSearch = style({
  padding: '0 16px 8px',
});

export const navNoMatches = style({
  padding: '8px 12px',
  fontSize: '0.85rem',
  color: vars.color.textMuted,
});

export const navListNoMatches = style({
  padding: '12px 16px',
  color: vars.color.textMuted,
});

export const navResult = style({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'flex-start',
  gap: '1px',
  minWidth: 0,
  textAlign: 'left',
});

export const navResultPage = style({
  fontSize: '0.75rem',
  fontWeight: 400,
  color: vars.color.textMuted,
});

const highlightFlash = keyframes({
  '0%, 50%': { backgroundColor: `rgba(${vars.color.accentRgb}, 0.16)` },
  '100%': { backgroundColor: 'transparent' },
});

export const searchHighlight = style({
  position: 'relative',
  isolation: 'isolate',
  selectors: {
    '&::before': {
      content: '""',
      position: 'absolute',
      inset: '0 -12px',
      zIndex: -1,
      pointerEvents: 'none',
      borderRadius: vars.radius.sm,
      animation: `${highlightFlash} 2s ease-out forwards`,
    },
  },
});
