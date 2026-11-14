import { globalStyle, keyframes, style } from '@vanilla-extract/css';
import { vars } from '@/theme/vars.css';
import { zIndex } from '@/theme/zIndex';
import { fontSize } from '@/theme/typeScale';

/** Phones: everything stacks and fills the width. */
const PHONE = '(max-width: 480px)';
/** Touch screens get bigger targets; a keyboard tip means nothing there. */
const TOUCH = '(max-width: 768px), (pointer: coarse)';
const NO_MOTION = '(prefers-reduced-motion: reduce)';

const appear = keyframes({
  from: { opacity: 0, transform: 'translateY(8px)' },
  to: { opacity: 1, transform: 'none' },
});

/** Entrance: each block rises in a beat after the one above it (`--i` is its place in line). */
export const enter = style({
  animation: `${appear} 320ms cubic-bezier(0.2, 0.7, 0.3, 1) both`,
  animationDelay: 'calc(var(--i, 0) * 55ms)',
  '@media': { [NO_MOTION]: { animation: 'none' } },
});

/** The scroll area; the content centres itself in it while it fits. */
export const home = style({
  flex: 1,
  minWidth: 0,
  height: '100%',
  overflowY: 'auto',
  overscrollBehavior: 'contain',
  // Content scrolling out at the bottom fades away instead of being cut off; the padding below the
  // last block is at least as tall as the fade, so the end of the page is never dimmed.
  maskImage: 'linear-gradient(to bottom, #000 calc(100% - 36px), transparent)',
  WebkitMaskImage: 'linear-gradient(to bottom, #000 calc(100% - 36px), transparent)',
  display: 'flex',
  flexDirection: 'column',
  padding:
    '32px max(24px, env(safe-area-inset-right)) calc(40px + env(safe-area-inset-bottom)) max(24px, env(safe-area-inset-left))',
  color: vars.color.textPrimary,
  '@media': {
    '(max-width: 768px)': {
      padding:
        '20px max(16px, env(safe-area-inset-right)) calc(40px + env(safe-area-inset-bottom)) max(16px, env(safe-area-inset-left))',
    },
  },
});

export const inner = style({
  width: '100%',
  maxWidth: '1040px',
  margin: '0 auto',
  display: 'flex',
  flexDirection: 'column',
  gap: '24px',
  containerType: 'inline-size',
  '@media': { [PHONE]: { gap: '20px' } },
});

// ---------- hero ----------

/** A compact welcome: the mound, the greeting and the tagline on a wash of the accent. */
export const hero = style({
  position: 'relative',
  display: 'flex',
  alignItems: 'center',
  gap: '18px',
  padding: '18px 22px',
  borderRadius: vars.radius.lg,
  border: `1px solid ${vars.color.border}`,
  backgroundColor: vars.color.bgPrimary,
  backgroundImage: `linear-gradient(120deg, rgba(${vars.color.accentRgb}, 0.16), rgba(${vars.color.accentRgb}, 0.03) 55%, transparent)`,
  '@media': { [PHONE]: { gap: '14px', padding: '14px 16px' } },
});

export const heroText = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '2px',
  minWidth: 0,
});

/** The mound sits on a soft pool of its own colour. */
export const logo = style({
  position: 'relative',
  isolation: 'isolate',
  display: 'flex',
  flexShrink: 0,
  '::before': {
    content: '""',
    position: 'absolute',
    inset: '-24px',
    zIndex: zIndex.behind,
    borderRadius: '50%',
    background: `radial-gradient(closest-side, ${vars.logo.hoverGlow}, transparent)`,
    opacity: 0.35,
    filter: 'blur(12px)',
    pointerEvents: 'none',
  },
});

export const title = style({
  fontSize: fontSize.rem160,
  fontWeight: 700,
  lineHeight: 1.2,
  color: vars.color.textPrimary,
  overflowWrap: 'anywhere',
  '@media': { [PHONE]: { fontSize: fontSize.rem130 } },
});

export const tagline = style({
  color: vars.color.textMuted,
  fontSize: fontSize.rem92,
  lineHeight: 1.4,
});

// ---------- sections ----------

export const section = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '12px',
});

/** One column on a phone; the main column and a side column once the pane is wide. */
export const columns = style({
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1fr)',
  gap: '24px',
  alignItems: 'start',
  '@container': {
    '(min-width: 720px)': { gridTemplateColumns: 'minmax(0, 1.5fr) minmax(0, 1fr)' },
  },
  '@media': { [PHONE]: { gap: '20px' } },
});

export const column = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '24px',
  minWidth: 0,
  selectors: { '&:empty': { display: 'none' } },
  '@media': { [PHONE]: { gap: '20px' } },
});

export const sectionLabel = style({
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
  fontSize: fontSize.rem78,
  fontWeight: 700,
  letterSpacing: '0.04em',
  textTransform: 'uppercase',
  color: vars.color.textMuted,
});

/** One column of wide rows in a narrow pane, three cards side by side once there is room. */
export const grid = style({
  display: 'grid',
  gridTemplateColumns: '1fr',
  gap: '10px',
  margin: 0,
  padding: 0,
  listStyle: 'none',
  '@container': {
    '(min-width: 540px)': { gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '12px' },
  },
});

export const gridItem = style({ display: 'flex', minWidth: 0 });

export const card = style({
  flex: 1,
  minWidth: 0,
  display: 'flex',
  alignItems: 'center',
  gap: '14px',
  minHeight: '72px',
  padding: '14px 16px',
  borderRadius: vars.radius.lg,
  border: `1px solid ${vars.color.border}`,
  backgroundColor: vars.color.bgPrimary,
  color: vars.color.textPrimary,
  font: 'inherit',
  textAlign: 'start',
  cursor: 'pointer',
  transition: 'border-color 150ms, background-color 150ms, transform 150ms, box-shadow 150ms',
  ':hover': {
    borderColor: `rgba(${vars.color.accentRgb}, 0.55)`,
    boxShadow: vars.shadow.lift,
  },
  ':active': { transform: 'translateY(1px)' },
  ':focus-visible': {
    outline: `2px solid ${vars.color.accent}`,
    outlineOffset: '2px',
  },
  '@container': {
    '(min-width: 540px)': {
      flexDirection: 'column',
      alignItems: 'flex-start',
      gap: '12px',
      padding: '18px',
    },
  },
  '@media': {
    '(hover: hover) and (prefers-reduced-motion: no-preference)': {
      selectors: { '&:hover': { transform: 'translateY(-2px)' } },
    },
  },
});

export const cardIcon = style({
  flexShrink: 0,
  width: '40px',
  height: '40px',
  borderRadius: vars.radius.md,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: vars.color.accent,
  backgroundColor: `rgba(${vars.color.accentRgb}, 0.14)`,
});

export const cardText = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '3px',
  minWidth: 0,
});

export const cardTitle = style({
  fontSize: fontSize.rem95,
  fontWeight: 600,
  lineHeight: 1.3,
  color: vars.color.textPrimary,
});

export const cardDesc = style({
  fontSize: fontSize.rem83,
  lineHeight: 1.4,
  color: vars.color.textMuted,
});

// ---------- finish setting up ----------

export const setupList = style({
  margin: 0,
  padding: 0,
  listStyle: 'none',
  borderRadius: vars.radius.lg,
  border: `1px solid ${vars.color.border}`,
  backgroundColor: vars.color.bgPrimary,
  overflow: 'hidden',
});

export const setupRow = style({
  width: '100%',
  display: 'flex',
  alignItems: 'center',
  gap: '14px',
  minHeight: '64px',
  padding: '12px 16px',
  border: 'none',
  background: 'none',
  color: vars.color.textPrimary,
  font: 'inherit',
  textAlign: 'start',
  cursor: 'pointer',
  transition: 'background-color 150ms',
  ':hover': { backgroundColor: vars.color.bgHover },
  ':focus-visible': {
    outline: `2px solid ${vars.color.accent}`,
    outlineOffset: '-2px',
    borderRadius: vars.radius.lg,
  },
});

globalStyle(`${setupList} > li + li`, {
  borderTop: `1px solid ${vars.color.border}`,
});

export const setupIcon = style([cardIcon, { width: '36px', height: '36px', borderRadius: '50%' }]);
export const setupIconWarning = style({
  color: vars.color.warning,
  backgroundColor: 'transparent',
  boxShadow: `inset 0 0 0 1.5px ${vars.color.warning}`,
});

export const setupText = style([cardText, { flex: 1 }]);

export const chevron = style({
  flexShrink: 0,
  color: vars.color.textMuted,
});

// ---------- dashboard panels ----------

const focusRing = {
  ':focus-visible': { outline: `2px solid ${vars.color.accent}`, outlineOffset: '-2px' },
} as const;

export const panel = style({
  display: 'flex',
  flexDirection: 'column',
  minWidth: 0,
  overflow: 'hidden',
  borderRadius: vars.radius.lg,
  border: `1px solid ${vars.color.border}`,
  backgroundColor: vars.color.bgPrimary,
});

export const panelHeader = style({
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  padding: '12px 14px 8px',
});

export const panelIcon = style({
  display: 'flex',
  flexShrink: 0,
  alignItems: 'center',
  justifyContent: 'center',
  width: '26px',
  height: '26px',
  borderRadius: '50%',
  color: vars.color.accent,
  backgroundColor: `rgba(${vars.color.accentRgb}, 0.14)`,
});

export const panelTitle = style({
  flex: 1,
  minWidth: 0,
  margin: 0,
  fontSize: fontSize.rem95,
  fontWeight: 700,
  color: vars.color.textPrimary,
});

export const panelAction = style({
  flexShrink: 0,
  display: 'inline-flex',
  alignItems: 'center',
  minHeight: '32px',
  padding: '0 8px',
  border: 'none',
  borderRadius: vars.radius.sm,
  background: 'none',
  color: vars.color.accent,
  font: 'inherit',
  fontSize: fontSize.rem83,
  fontWeight: 600,
  cursor: 'pointer',
  ':hover': { backgroundColor: `rgba(${vars.color.accentRgb}, 0.12)` },
  ...focusRing,
  '@media': { '(pointer: coarse)': { minHeight: '44px', padding: '0 10px' } },
});

export const rows = style({
  margin: 0,
  padding: 0,
  listStyle: 'none',
});

globalStyle(`${rows} > li + li`, { borderTop: `1px solid ${vars.color.border}` });

export const row = style({
  width: '100%',
  display: 'flex',
  alignItems: 'center',
  gap: '12px',
  minHeight: '60px',
  padding: '10px 14px',
  border: 'none',
  background: 'none',
  color: vars.color.textPrimary,
  font: 'inherit',
  textAlign: 'start',
  cursor: 'pointer',
  transition: 'background-color 150ms',
  ':hover': { backgroundColor: vars.color.bgHover },
  ':active': { backgroundColor: vars.color.bgActive },
  ...focusRing,
});

export const rowText = style({
  flex: 1,
  minWidth: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: '2px',
});

export const rowTitle = style({
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  fontSize: fontSize.rem92,
  fontWeight: 600,
  lineHeight: 1.3,
  color: vars.color.textPrimary,
});

export const rowSub = style({
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  fontSize: fontSize.rem80,
  lineHeight: 1.35,
  color: vars.color.textMuted,
});

export const rowTag = style({
  flexShrink: 0,
  display: 'inline-flex',
  alignItems: 'center',
  gap: '5px',
  fontSize: fontSize.rem75,
  color: vars.color.textMuted,
});

export const inlineIcon = style({
  marginRight: '5px',
  verticalAlign: '-1px',
  color: vars.color.success,
});

// ---------- jump back in ----------

export const roomGrid = style({
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1fr)',
  gap: '10px',
  margin: 0,
  padding: 0,
  listStyle: 'none',
  '@container': {
    '(min-width: 480px)': { gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' },
  },
});

export const roomCard = style({
  flex: 1,
  minWidth: 0,
  display: 'flex',
  alignItems: 'center',
  gap: '12px',
  minHeight: '64px',
  padding: '10px 14px',
  borderRadius: vars.radius.lg,
  border: `1px solid ${vars.color.border}`,
  backgroundColor: vars.color.bgPrimary,
  color: vars.color.textPrimary,
  font: 'inherit',
  textAlign: 'start',
  cursor: 'pointer',
  transition: 'border-color 150ms, box-shadow 150ms, transform 150ms',
  ':hover': {
    borderColor: `rgba(${vars.color.accentRgb}, 0.55)`,
    boxShadow: vars.shadow.lift,
  },
  ':active': { transform: 'translateY(1px)' },
  ':focus-visible': { outline: `2px solid ${vars.color.accent}`, outlineOffset: '2px' },
});

const badgeBase = {
  flexShrink: 0,
  minWidth: '22px',
  padding: '2px 7px',
  borderRadius: vars.radius.pill,
  fontSize: '0.73rem',
  fontWeight: 700,
  lineHeight: 1.4,
  textAlign: 'center',
} as const;

export const badge = style({
  ...badgeBase,
  color: vars.color.accent,
  backgroundColor: `rgba(${vars.color.accentRgb}, 0.18)`,
});

export const badgeMention = style({
  ...badgeBase,
  color: vars.color.onAccent,
  backgroundColor: vars.color.danger,
});

// ---------- quick actions once there are rooms ----------

export const chips = style({
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(104px, 1fr))',
  gap: '8px',
  margin: 0,
  padding: 0,
  listStyle: 'none',
});

// Equal tiles: icon above its label, so three of them fit a phone in one row.
export const chip = style({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '6px',
  width: '100%',
  height: '100%',
  minHeight: '76px',
  padding: '10px 8px',
  borderRadius: vars.radius.lg,
  border: `1px solid ${vars.color.border}`,
  backgroundColor: vars.color.bgPrimary,
  color: vars.color.textPrimary,
  font: 'inherit',
  fontSize: fontSize.rem82,
  fontWeight: 600,
  lineHeight: 1.25,
  textAlign: 'center',
  cursor: 'pointer',
  transition: 'border-color 150ms, background-color 150ms',
  ':hover': {
    borderColor: `rgba(${vars.color.accentRgb}, 0.55)`,
    backgroundColor: vars.color.bgHover,
  },
  ':focus-visible': { outline: `2px solid ${vars.color.accent}`, outlineOffset: '2px' },
});

globalStyle(`${chip} > svg`, { color: vars.color.accent, flexShrink: 0 });

// ---------- live now ----------

/** On a wide screen the Active now panel beside Home already shows these. */
export const liveOnlyNarrow = style({
  '@media': { '(min-width: 769px)': { display: 'none' } },
});

export const liveRow = style({
  display: 'flex',
  alignItems: 'center',
  gap: '12px',
  minHeight: '60px',
  padding: '10px 14px',
});

export const avatarStack = style({
  display: 'flex',
  alignItems: 'center',
  marginTop: '4px',
});

export const stackItem = style({
  display: 'flex',
  borderRadius: '50%',
  boxShadow: `0 0 0 2px ${vars.color.bgPrimary}`,
  selectors: { '& + &': { marginLeft: '-8px' } },
});

export const stackMore = style({
  marginLeft: '6px',
  fontSize: fontSize.rem75,
  fontWeight: 600,
  color: vars.color.textMuted,
});

// ---------- what's new ----------

export const whatsNew = style({
  backgroundImage: `linear-gradient(180deg, rgba(${vars.color.accentRgb}, 0.12), transparent 140px)`,
  paddingBottom: '14px',
});

export const versionPill = style({
  flexShrink: 0,
  padding: '2px 9px',
  borderRadius: vars.radius.pill,
  fontSize: '0.73rem',
  fontWeight: 700,
  color: vars.color.accent,
  backgroundColor: `rgba(${vars.color.accentRgb}, 0.16)`,
});

export const notes = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '8px',
  margin: 0,
  padding: '2px 14px 12px',
  listStyle: 'none',
});

export const note = style({
  position: 'relative',
  paddingInlineStart: '16px',
  fontSize: '0.86rem',
  lineHeight: 1.45,
  color: vars.color.textSecondary,
  '::before': {
    content: '""',
    position: 'absolute',
    insetInlineStart: '2px',
    top: '0.55em',
    width: '6px',
    height: '6px',
    borderRadius: '50%',
    backgroundColor: vars.color.accent,
  },
});

globalStyle(`${whatsNew} > button`, { alignSelf: 'flex-start', marginInline: '14px' });

// ---------- keyboard tip ----------

export const hint = style({
  textAlign: 'center',
  fontSize: fontSize.rem83,
  lineHeight: 1.6,
  color: vars.color.textMuted,
  '@media': { [TOUCH]: { display: 'none' } },
});

export const kbd = style({
  display: 'inline-block',
  margin: '0 2px',
  padding: '1px 6px',
  fontFamily: 'inherit',
  fontSize: fontSize.rem75,
  lineHeight: 1.5,
  borderRadius: vars.radius.sm,
  border: `1px solid ${vars.color.border}`,
  borderBottomWidth: '2px',
  backgroundColor: vars.color.bgTertiary,
  color: vars.color.textPrimary,
});
