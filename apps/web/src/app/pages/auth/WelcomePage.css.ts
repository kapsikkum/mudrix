import { globalStyle, keyframes, style } from '@vanilla-extract/css';
import { vars } from '@/theme/vars.css';
import { fontSize } from '@/theme/typeScale';

/** Phones (and phone-sized windows): the card fills the width and sits at the top. */
const PHONE = '(max-width: 520px)';
/** Touch screens get bigger targets and 16px inputs (smaller text makes iOS zoom in on focus). */
const TOUCH = '(max-width: 768px), (pointer: coarse)';
const NO_MOTION = '(prefers-reduced-motion: reduce)';

const appear = keyframes({
  from: { opacity: 0, transform: 'translateY(6px)' },
  to: { opacity: 1, transform: 'none' },
});

const spin = keyframes({ to: { transform: 'rotate(360deg)' } });

/** The page scrolls itself (html and body never do), so a tall form stays reachable. */
export const page = style({
  position: 'absolute',
  inset: 0,
  overflowY: 'auto',
  overscrollBehavior: 'contain',
  // A scrollbar showing up (the server box unfolding) must not nudge the card sideways.
  scrollbarGutter: 'stable',
  backgroundColor: vars.color.bgPrimary,
  color: vars.color.textPrimary,
});

/**
 * The card hangs from a fixed top offset instead of being centred: when the form below the
 * server box changes height, nothing above it moves. The offset centres a typical card on
 * tall screens.
 */
export const column = style({
  minHeight: '100%',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  padding: '24px 24px 16px',
  paddingTop: 'max(24px, calc((100vh - 780px) / 2))',
  '@media': {
    // On touch screens the viewport height changes when the keyboard opens; a vh-based offset
    // would make the whole form jump on focus.
    '(pointer: coarse)': { paddingTop: 'calc(24px + var(--safe-top))' },
    [PHONE]: {
      padding: `calc(12px + var(--safe-top)) calc(16px + var(--safe-right)) calc(12px + var(--safe-bottom)) calc(16px + var(--safe-left))`,
    },
  },
});

export const back = style({
  alignSelf: 'flex-start',
  marginBottom: '8px',
});

export const card = style({
  width: '100%',
  maxWidth: '440px',
  backgroundColor: vars.color.bgSecondary,
  borderRadius: vars.radius.lg,
  border: `1px solid ${vars.color.border}`,
  padding: '32px 32px 24px',
  boxShadow: '0 10px 40px rgba(0, 0, 0, 0.18)',
  '@media': {
    [PHONE]: {
      // On a phone the screen is the card.
      backgroundColor: 'transparent',
      border: 'none',
      boxShadow: 'none',
      padding: '8px 0 16px',
    },
  },
});

export const header = style({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: '6px',
  marginBottom: '20px',
  textAlign: 'center',
});

export const title = style({
  fontSize: fontSize.rem150,
  fontWeight: 700,
  lineHeight: 1.25,
  color: vars.color.textPrimary,
  outline: 'none',
});

export const subtitle = style({
  color: vars.color.textMuted,
  fontSize: fontSize.rem92,
  lineHeight: 1.4,
});

/** One view (sign in, sign up, reset); fades in when switched to. */
export const view = style({
  display: 'flex',
  flexDirection: 'column',
  animation: `${appear} 180ms ease-out`,
  '@media': { [NO_MOTION]: { animation: 'none' } },
});

export const form = style({
  display: 'flex',
  flexDirection: 'column',
});

// ---------- fields ----------

export const field = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '6px',
});

export const labelRow = style({
  display: 'flex',
  alignItems: 'baseline',
  justifyContent: 'space-between',
  gap: '8px',
  minHeight: '18px',
});

export const label = style({
  fontSize: fontSize.rem78,
  fontWeight: 700,
  letterSpacing: '0.04em',
  textTransform: 'uppercase',
  color: vars.color.textMuted,
});

export const required = style({ color: vars.color.error, marginLeft: '2px' });

/**
 * The line under a field. Always there and always at least one line tall, so a hint or an
 * error appearing never pushes the rest of the form down.
 */
export const message = style({
  minHeight: '20px',
  padding: '3px 0 1px',
  fontSize: fontSize.rem80,
  lineHeight: '16px',
  color: vars.color.textMuted,
  overflowWrap: 'anywhere',
});
export const messageError = style([message, { color: vars.color.error }]);

export const inlineLink = style({
  fontSize: 'inherit',
  color: vars.color.accent,
  cursor: 'pointer',
  border: 'none',
  background: 'none',
  padding: 0,
  font: 'inherit',
  textDecoration: 'none',
  borderRadius: '3px',
  ':hover': { textDecoration: 'underline' },
  ':disabled': { color: vars.color.textMuted, cursor: 'default', textDecoration: 'none' },
});

/** A text link with a touch-sized hit area that does not change the layout. */
export const textLink = style([
  inlineLink,
  {
    alignSelf: 'flex-start',
    fontSize: fontSize.rem85,
    padding: '4px 0',
    margin: '-4px 0',
    '@media': { [TOUCH]: { padding: '10px 0', margin: '-10px 0' } },
  },
]);

// ---------- server picker ----------

export const server = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '6px',
  // The same space as under a field (its gap, message line and padding), so the form is evenly spaced
  marginBottom: '26px',
});

export const serverChip = style({
  display: 'flex',
  alignItems: 'center',
  gap: '12px',
  minHeight: '56px',
  padding: '8px 8px 8px 12px',
  borderRadius: vars.radius.sm,
  border: `1px solid ${vars.color.border}`,
  backgroundColor: vars.color.bgTertiary,
});

export const serverIcon = style({
  flexShrink: 0,
  color: vars.color.textMuted,
  display: 'flex',
});

export const serverText = style({
  flex: 1,
  minWidth: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: '2px',
});

export const serverName = style({
  fontSize: fontSize.rem95,
  fontWeight: 600,
  color: vars.color.textPrimary,
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
});

export const changeButton = style({
  flexShrink: 0,
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px',
  minHeight: '36px',
  padding: '0 12px',
  borderRadius: vars.radius.sm,
  border: `1px solid ${vars.color.accent}`,
  background: 'none',
  color: vars.color.accent,
  font: 'inherit',
  fontSize: fontSize.rem85,
  fontWeight: 600,
  whiteSpace: 'nowrap',
  cursor: 'pointer',
  ':hover': { backgroundColor: vars.color.bgHover },
  '@media': { [TOUCH]: { minHeight: '44px' } },
});

export const serverEditor = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '6px',
  padding: '12px',
  borderRadius: vars.radius.sm,
  border: `1px solid ${vars.color.border}`,
  backgroundColor: vars.color.bgTertiary,
  animation: `${appear} 150ms ease-out`,
  '@media': { [NO_MOTION]: { animation: 'none' } },
});

export const presets = style({
  display: 'flex',
  flexWrap: 'wrap',
  gap: '6px',
});

export const preset = style({
  minHeight: '32px',
  padding: '0 12px',
  borderRadius: vars.radius.pill,
  border: `1px solid ${vars.color.border}`,
  backgroundColor: vars.color.bgSecondary,
  color: vars.color.textPrimary,
  font: 'inherit',
  fontSize: fontSize.rem82,
  cursor: 'pointer',
  ':hover': { backgroundColor: vars.color.bgHover },
  selectors: {
    '&[aria-pressed="true"]': {
      borderColor: vars.color.accent,
      backgroundColor: `rgba(${vars.color.accentRgb}, 0.15)`,
    },
  },
  '@media': { [TOUCH]: { minHeight: '40px', padding: '0 14px' } },
});

/**
 * The status line under the server address: one line, always present, so the answer arriving
 * (or changing) never moves anything. Long text is cut with an ellipsis (full text in `title`).
 */
export const status = style({
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
  height: '18px',
  minWidth: 0,
  fontSize: fontSize.rem80,
  lineHeight: '18px',
  color: vars.color.textMuted,
  transition: 'opacity 150ms',
});
export const statusStale = style({ opacity: 0.55 });
export const statusOk = style({ color: vars.color.success });
export const statusBad = style({ color: vars.color.error });

export const statusText = style({
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  minWidth: 0,
});

/** The fixed-size slot at the start of the status line: a dot, or a spinner while checking. */
export const statusMark = style({
  flexShrink: 0,
  width: '10px',
  height: '10px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
});
export const dot = style({
  width: '8px',
  height: '8px',
  borderRadius: '50%',
  backgroundColor: 'currentColor',
});
export const spinner = style({
  width: '10px',
  height: '10px',
  borderRadius: '50%',
  border: '2px solid currentColor',
  borderRightColor: 'transparent',
  animation: `${spin} 700ms linear infinite`,
  '@media': { [NO_MOTION]: { animation: `${spin} 2s linear infinite` } },
});

export const retry = style([inlineLink, { flexShrink: 0, fontSize: fontSize.rem80 }]);

// ---------- actions ----------

/** Form-level message (a failed sign-in) above the main button; its space is kept when empty. */
export const formError = style({
  minHeight: '24px',
  padding: '4px 0',
  fontSize: fontSize.rem85,
  lineHeight: 1.4,
  color: vars.color.error,
});
export const formInfo = style([formError, { color: vars.color.textMuted }]);
export const formSuccess = style([formError, { color: vars.color.success }]);

export const submit = style({
  minHeight: '44px',
});

export const altText = style({
  marginTop: '12px',
  fontSize: fontSize.rem88,
  color: vars.color.textMuted,
});

export const divider = style({
  display: 'flex',
  alignItems: 'center',
  gap: '12px',
  margin: '20px 0 16px',
  color: vars.color.textMuted,
  fontSize: fontSize.rem78,
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  '::before': { content: '""', flex: 1, height: '1px', backgroundColor: vars.color.border },
  '::after': { content: '""', flex: 1, height: '1px', backgroundColor: vars.color.border },
});

export const altMethods = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '8px',
});

export const idpIcon = style({
  width: '18px',
  height: '18px',
  objectFit: 'contain',
});

export const note = style({
  fontSize: fontSize.rem85,
  lineHeight: 1.45,
  color: vars.color.textMuted,
  marginBottom: '12px',
});

export const passwordReqs = style({
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  gap: '2px 12px',
  margin: '0 0 8px',
  padding: 0,
  listStyle: 'none',
  fontSize: fontSize.rem78,
  color: vars.color.textMuted,
  '@media': { [PHONE]: { gridTemplateColumns: '1fr' } },
});

export const reqItem = style({
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
  lineHeight: 1.6,
});
export const reqMet = style({ color: vars.color.success });

export const strength = style({
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
});

export const strengthBars = style({
  display: 'flex',
  gap: '4px',
  flex: 1,
  maxWidth: '160px',
});

export const strengthBar = style({
  flex: 1,
  height: '4px',
  borderRadius: vars.radius.sm,
  backgroundColor: vars.color.border,
  transition: 'background-color 0.2s',
});

export const strengthBarWeak = style([strengthBar, { backgroundColor: vars.color.error }]);
export const strengthBarOkay = style([strengthBar, { backgroundColor: vars.color.warning }]);
export const strengthBarStrong = style([strengthBar, { backgroundColor: vars.color.success }]);

// ---------- footer ----------

export const footer = style({
  marginTop: 'auto',
  paddingTop: '24px',
  display: 'flex',
  alignItems: 'center',
  gap: '12px',
  color: vars.color.textMuted,
  fontSize: fontSize.rem75,
});

// ---------- page-wide touches ----------

globalStyle(`${page} input`, {
  '@media': { [TOUCH]: { fontSize: fontSize.px16, minHeight: '44px' } },
});

globalStyle(`${page} input:focus-visible`, {
  boxShadow: `0 0 0 3px rgba(${vars.color.accentRgb}, 0.3)`,
});

globalStyle(`${page} button:focus-visible, ${page} a:focus-visible`, {
  outline: `2px solid ${vars.color.accent}`,
  outlineOffset: '2px',
});

globalStyle(`${page} input[aria-invalid="true"]`, {
  borderColor: vars.color.error,
});

/** Read by screen readers, not shown. */
export const srOnly = style({
  position: 'absolute',
  width: '1px',
  height: '1px',
  padding: 0,
  margin: '-1px',
  overflow: 'hidden',
  clip: 'rect(0, 0, 0, 0)',
  whiteSpace: 'nowrap',
  border: 0,
});

export const reqIcon = style({
  flexShrink: 0,
  width: '12px',
  height: '12px',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
});

export const doneButton = style([
  inlineLink,
  {
    fontSize: fontSize.rem85,
    fontWeight: 600,
    padding: '4px 6px',
    margin: '-4px -6px',
    '@media': { [TOUCH]: { padding: '10px 8px', margin: '-10px -8px' } },
  },
]);
