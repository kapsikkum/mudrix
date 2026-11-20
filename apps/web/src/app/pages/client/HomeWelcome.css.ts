import { globalStyle, keyframes, style } from '@vanilla-extract/css';
import { vars } from '@/theme/vars.css';
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
    '24px max(24px, env(safe-area-inset-right)) calc(40px + env(safe-area-inset-bottom)) max(24px, env(safe-area-inset-left))',
  color: vars.color.textPrimary,
  '@media': {
    '(max-width: 768px)': {
      padding:
        '16px max(16px, env(safe-area-inset-right)) calc(40px + env(safe-area-inset-bottom)) max(16px, env(safe-area-inset-left))',
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
  fontSize: fontSize.xs,
  fontWeight: 600,
  color: vars.color.textMuted,
});

/** One column of wide rows in a narrow pane, three cards side by side once there is room. */
export const grid = style({
  display: 'grid',
  gridTemplateColumns: '1fr',
  gap: '12px',
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
  gap: '12px',
  minHeight: '72px',
  padding: '16px',
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
      padding: '16px',
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
  gap: '4px',
  minWidth: 0,
});

export const cardTitle = style({
  fontSize: fontSize.md,
  fontWeight: 600,
  lineHeight: 1.3,
  color: vars.color.textPrimary,
});

export const cardDesc = style({
  fontSize: fontSize.sm,
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
  gap: '12px',
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

/** Anchors the row's dismiss button; the row itself keeps the old app's layout. */
export const setupItem = style({ position: 'relative' });

export const setupDismiss = style({
  position: 'absolute',
  top: '6px',
  insetInlineEnd: '8px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '20px',
  height: '20px',
  padding: 0,
  border: 'none',
  borderRadius: '50%',
  background: 'transparent',
  color: vars.color.textMuted,
  cursor: 'pointer',
  opacity: 0,
  transition: 'opacity 120ms, background-color 120ms, color 120ms',
  selectors: {
    [`${setupItem}:hover &`]: { opacity: 1 },
    '&:hover': { backgroundColor: vars.color.bgTertiary, color: vars.color.textPrimary },
    '&:focus-visible': {
      opacity: 1,
      outline: `2px solid ${vars.color.accent}`,
      outlineOffset: '1px',
    },
  },
  // No hover on a touch screen: the row's dismiss button stays visible there.
  '@media': { '(hover: none)': { opacity: 1 } },
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
  padding: '12px 16px 8px',
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
  fontSize: fontSize.md,
  fontWeight: 600,
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
  fontSize: fontSize.sm,
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
  padding: '10px 16px',
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
  fontSize: fontSize.sm,
  fontWeight: 600,
  lineHeight: 1.3,
  color: vars.color.textPrimary,
});

export const rowSub = style({
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  fontSize: fontSize.xs,
  lineHeight: 1.35,
  color: vars.color.textMuted,
});

export const rowTag = style({
  flexShrink: 0,
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px',
  fontSize: fontSize.xs,
  color: vars.color.textMuted,
});

export const activityIcon = style({
  marginRight: '4px',
  verticalAlign: '-2px',
});

export const inlineIcon = style({
  marginRight: '6px',
  verticalAlign: '-1px',
  color: vars.color.success,
});

// ---------- jump back in ----------

export const roomGrid = style({
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1fr)',
  gap: '12px',
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
  padding: '10px 16px',
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
  padding: '2px 8px',
  borderRadius: vars.radius.pill,
  fontSize: fontSize.xs,
  fontWeight: 600,
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
  fontSize: fontSize.sm,
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
  padding: '10px 16px',
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
  fontSize: fontSize.xs,
  fontWeight: 600,
  color: vars.color.textMuted,
});

// ---------- what's new ----------

export const whatsNew = style({
  paddingBottom: '16px',
});

export const versionPill = style({
  flexShrink: 0,
  marginInlineStart: 'auto',
  padding: '2px 10px',
  borderRadius: vars.radius.pill,
  fontSize: fontSize.xs,
  fontWeight: 600,
  color: vars.color.accent,
  backgroundColor: `rgba(${vars.color.accentRgb}, 0.16)`,
});

export const notes = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '8px',
  margin: 0,
  padding: '20px 16px 12px',
  listStyle: 'none',
});

export const note = style({
  position: 'relative',
  paddingInlineStart: '16px',
  fontSize: fontSize.sm,
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
  fontSize: fontSize.sm,
  lineHeight: 1.6,
  color: vars.color.textMuted,
  '@media': { [TOUCH]: { display: 'none' } },
});

export const kbd = style({
  display: 'inline-block',
  margin: '0 2px',
  padding: '1px 6px',
  fontFamily: 'inherit',
  fontSize: fontSize.xs,
  lineHeight: 1.5,
  borderRadius: vars.radius.sm,
  border: `1px solid ${vars.color.border}`,
  borderBottomWidth: '2px',
  backgroundColor: vars.color.bgTertiary,
  color: vars.color.textPrimary,
});
