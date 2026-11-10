import { globalStyle, keyframes, style } from '@vanilla-extract/css';
import { vars } from '@/theme/vars.css';
import { fast } from '@/theme/animations.css';
import { navItem } from '@/app/components/Settings/Settings.css';
import { fontSize } from '@/theme/typeScale';

export * from '@/app/components/Settings/Settings.css';

export const navDivider = style({
  height: '1px',
  backgroundColor: vars.color.border,
  margin: '6px 8px',
});

export const actionBtn = style({
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '6px',
  padding: '9px 20px',
  borderRadius: vars.radius.sm,
  fontSize: fontSize.rem90,
  fontWeight: 500,
  cursor: 'pointer',
  border: 'none',
  backgroundColor: vars.color.accent,
  color: vars.color.onAccent,
  ':hover': { backgroundColor: vars.color.accentHover },
  ':disabled': { opacity: 0.5, cursor: 'not-allowed' },
});

export const actionBtnSecondary = style([
  actionBtn,
  { backgroundColor: vars.color.bgTertiary, color: vars.color.textPrimary },
]);

export const inputCss = style({
  padding: '9px 12px',
  backgroundColor: vars.color.bgInput,
  color: vars.color.textPrimary,
  border: `1px solid ${vars.color.border}`,
  borderRadius: vars.radius.sm,
  fontSize: fontSize.rem90,
  outline: 'none',
  ':focus': { borderColor: vars.color.accent },
});

export const inputFull = style([inputCss, { width: '100%' }]);

export const displayNameInput = style({
  backgroundColor: vars.color.bgTertiary,
  color: vars.color.textPrimary,
});

export const settingRowColumn = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '8px',
});

export const fieldLabel = style({
  display: 'block',
  fontSize: fontSize.rem82,
  fontWeight: 600,
  color: vars.color.textMuted,
  letterSpacing: '0.05em',
  cursor: 'text',
});

export const statusText = style({
  fontSize: fontSize.rem85,
  flexShrink: 0,
});

export const versionText = style({
  color: vars.color.textMuted,
  fontSize: fontSize.rem90,
});

export const accessTokenBtn = style({
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  border: 'none',
  background: 'none',
  color: vars.color.textPrimary,
  cursor: 'pointer',
  fontWeight: 600,
  fontSize: fontSize.rem95,
});

export const tokenSection = style({
  marginTop: '12px',
  display: 'flex',
  flexDirection: 'column',
  gap: '10px',
});

export const warningBox = style({
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  padding: '8px',
  backgroundColor: 'rgba(248,81,73,0.1)',
  borderRadius: '6px',
  fontSize: fontSize.rem82,
  color: vars.color.error,
});

export const clearBtn = style({
  border: 'none',
  background: 'none',
  color: vars.color.textMuted,
  cursor: 'pointer',
  fontSize: fontSize.rem90,
  display: 'flex',
  alignItems: 'center',
});

export const kbd = style({
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '1px 5px',
  borderRadius: '3px',
  border: `1px solid ${vars.color.border}`,
  backgroundColor: vars.color.bgTertiary,
  fontSize: fontSize.rem70,
  fontFamily: 'monospace',
  color: vars.color.textSecondary,
});

export const kbdStack = style({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'flex-end',
  gap: '4px',
});

export const keybindHint = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'flex-end',
  gap: '6px',
  margin: '-4px 0 10px',
  fontSize: fontSize.rem80,
  color: vars.color.textMuted,
});

const keybindBtnBase = style({
  minWidth: '110px',
  padding: '6px 10px',
  whiteSpace: 'nowrap',
  borderRadius: vars.radius.sm,
  border: '2px solid transparent',
  backgroundColor: vars.color.bgTertiary,
  cursor: 'pointer',
  fontSize: fontSize.rem85,
  textAlign: 'center',
  transition: `background-color ${fast}, border-color ${fast}, color ${fast}`,
  ':hover': {
    backgroundColor: vars.color.bgHover,
  },
});

export const keybindBtnSet = style([
  keybindBtnBase,
  {
    borderColor: vars.color.border,
    color: vars.color.textPrimary,
    fontWeight: 600,
    letterSpacing: '0.05em',
    ':hover': { borderColor: vars.color.textMuted },
  },
]);

export const keybindBtnEmpty = style([
  keybindBtnBase,
  {
    borderStyle: 'dashed',
    borderColor: vars.color.border,
    color: vars.color.textMuted,
    fontWeight: 400,
    letterSpacing: 'normal',
  },
]);

export const keybindBtnListening = style([
  keybindBtnBase,
  {
    borderColor: vars.color.accent,
    backgroundColor: vars.color.bgActive,
    color: vars.color.accent,
    fontWeight: 600,
    letterSpacing: 'normal',
    ':hover': { backgroundColor: vars.color.bgActive },
  },
]);

export const keybindEdit = style({
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px',
  minHeight: '30px',
  padding: '3px 4px 3px 7px',
  boxSizing: 'border-box',
  borderRadius: vars.radius.sm,
  border: `1px dashed ${vars.color.border}`,
  backgroundColor: 'transparent',
  cursor: 'pointer',
  transition: `background-color ${fast}, border-color ${fast}`,
  ':hover': { backgroundColor: vars.color.bgHover, borderColor: vars.color.textMuted },
  ':focus-visible': { outline: `2px solid ${vars.color.accent}`, outlineOffset: '1px' },
});

export const keybindEditListening = style([
  keybindEdit,
  {
    borderStyle: 'solid',
    borderColor: vars.color.accent,
    backgroundColor: vars.color.bgActive,
    ':hover': { backgroundColor: vars.color.bgActive, borderColor: vars.color.accent },
  },
]);

export const keybindEditIcon = style({
  flexShrink: 0,
  color: vars.color.textMuted,
  transition: `color ${fast}`,
  selectors: { [`${keybindEdit}:hover &`]: { color: vars.color.textPrimary } },
});

export const keybindPlaceholder = style({
  padding: '0 4px',
  fontSize: fontSize.rem80,
  color: vars.color.textMuted,
  whiteSpace: 'nowrap',
});

export const externalLink = style({
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px',
  color: vars.color.accent,
  textDecoration: 'none',
  fontSize: fontSize.rem90,
  fontWeight: 500,
  transition: `color ${fast}`,
  ':hover': {
    color: vars.color.accentHover,
    textDecoration: 'underline',
  },
  ':focus-visible': {
    outline: `2px solid ${vars.color.accent}`,
    outlineOffset: '2px',
    borderRadius: '2px',
  },
});

// Phone layout: a list of sections, then one section at a time with a back arrow.
export const mobileRoot = style({
  flex: 1,
  minWidth: 0,
  display: 'flex',
  flexDirection: 'column',
  backgroundColor: vars.color.bgSecondary,
  overflow: 'hidden',
});

export const mobileTopBar = style({
  display: 'flex',
  alignItems: 'center',
  gap: '4px',
  height: '56px',
  padding: '0 8px',
  flexShrink: 0,
  borderBottom: `1px solid ${vars.color.border}`,
  color: vars.color.textPrimary,
});

export const mobileTopTitle = style({
  flex: 1,
  minWidth: 0,
  fontSize: fontSize.rem110,
  fontWeight: 700,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  padding: '0 8px',
});

export const mobileIconBtn = style({
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

export const mobileList = style({
  flex: 1,
  overflowY: 'auto',
  padding: '8px 0 calc(8px + var(--safe-bottom))',
});

export const mobileRow = style({
  display: 'flex',
  alignItems: 'center',
  gap: '16px',
  width: '100%',
  minHeight: '56px',
  padding: '0 20px',
  border: 'none',
  background: 'none',
  color: vars.color.textPrimary,
  fontSize: fontSize.rem100,
  textAlign: 'left',
  cursor: 'pointer',
  selectors: { '&:active': { backgroundColor: vars.color.bgHover } },
});

export const mobileRowLabel = style({ flex: 1, minWidth: 0 });

export const mobileRowChevron = style({ color: vars.color.textMuted, flexShrink: 0 });

export const mobileDivider = style({
  height: '1px',
  backgroundColor: vars.color.border,
  margin: '8px 20px',
});

export const mobileContent = style({
  flex: 1,
  overflowY: 'auto',
  padding: '16px 16px calc(24px + var(--safe-bottom))',
  color: vars.color.textPrimary,
});

// The page title is already in the top bar.
globalStyle(`${mobileContent} > div > h2:first-child, ${mobileContent} > h2:first-child`, {
  display: 'none',
});

export const navFooter = style({
  marginTop: 'auto',
  paddingTop: '12px',
});

export const navLogout = style([
  navItem,
  {
    marginTop: '8px',
    justifyContent: 'center',
    color: vars.color.error,
    ':hover': { color: vars.color.error },
  },
]);

// The sections of the open page, listed under its sidebar entry, with a rule down the left. The
// wrapper grows from nothing to the list's height (a grid row goes from 0fr to 1fr).
export const navSubWrap = style({
  display: 'grid',
  gridTemplateRows: '0fr',
  opacity: 0,
  transition: 'grid-template-rows 360ms cubic-bezier(0.25, 0.8, 0.25, 1), opacity 300ms ease-out',
});

export const navSubWrapOpen = style([navSubWrap, { gridTemplateRows: '1fr', opacity: 1 }]);

export const navSubClip = style({ minHeight: 0, overflow: 'hidden' });

export const navSub = style({
  display: 'flex',
  flexDirection: 'column',
  margin: '2px 0 4px 18px',
  borderLeft: `2px solid ${vars.color.border}`,
});

export const navSubItem = style({
  position: 'relative',
  padding: '6px 12px',
  border: 'none',
  background: 'none',
  textAlign: 'left',
  cursor: 'pointer',
  fontSize: fontSize.rem85,
  fontWeight: 500,
  color: vars.color.textMuted,
  transition: `color ${fast}`,
  ':hover': { color: vars.color.textPrimary },
});

export const navSubItemActive = style([
  navSubItem,
  {
    color: vars.color.textPrimary,
    selectors: {
      '&::before': {
        content: '""',
        position: 'absolute',
        left: '-2px',
        top: '4px',
        bottom: '4px',
        width: '2px',
        borderRadius: '1px',
        backgroundColor: vars.color.textPrimary,
      },
    },
  },
]);

// A heading the sidebar just jumped to lights up, then fades.
const flashFade = keyframes({
  '0%': {
    backgroundColor: `color-mix(in srgb, ${vars.color.accent} 38%, transparent)`,
    boxShadow: `0 0 0 6px color-mix(in srgb, ${vars.color.accent} 38%, transparent)`,
  },
  '100%': { backgroundColor: 'transparent', boxShadow: '0 0 0 6px transparent' },
});

export const sectionFlash = style({
  borderRadius: vars.radius.sm,
  animation: `${flashFade} 1400ms ease-out`,
});
