import { keyframes, style } from '@vanilla-extract/css';
import { vars } from '@/theme/vars.css';
import { TITLE_BAR_HEIGHT } from '@/app/components/TitleBar/TitleBar.css';

export const page = style({
  minHeight: '100vh',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: '24px',
  backgroundColor: vars.color.bgPrimary,
  selectors: {
    'html.desktop &': {
      paddingTop: `${24 + TITLE_BAR_HEIGHT}px`,
    },
  },
  padding: '24px',
  '@media': {
    '(max-width: 768px)': {
      gap: '16px',
      padding: `calc(16px + env(safe-area-inset-top)) calc(16px + env(safe-area-inset-right)) calc(16px + env(safe-area-inset-bottom)) calc(16px + env(safe-area-inset-left))`,
    },
  },
});

export const container = style({
  width: '100%',
  maxWidth: '420px',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: '16px',
  backgroundColor: vars.color.bgSecondary,
  borderRadius: vars.radius.md,
  border: `1px solid ${vars.color.border}`,
  padding: '40px 32px',
  margin: 'auto 0',
  '@media': {
    '(max-width: 768px)': {
      order: 1,
    },
  },
});

export const logo = style({
  width: '72px',
  height: '72px',
  objectFit: 'contain',
});

export const title = style({
  fontSize: '1.5rem',
  fontWeight: 700,
  color: vars.color.textPrimary,
  textAlign: 'center',
});

export const tagline = style({
  color: vars.color.textMuted,
  fontSize: '0.9rem',
  textAlign: 'center',
  marginBottom: '8px',
});

export const footer = style({
  display: 'flex',
  flexWrap: 'wrap',
  justifyContent: 'center',
  gap: '6px 20px',
  '@media': {
    '(max-width: 768px)': {
      order: 2,
    },
  },
});

export const footerLink = style({
  fontSize: '0.8rem',
  color: vars.color.textMuted,
  textDecoration: 'none',
  ':hover': {
    color: vars.color.textPrimary,
  },
});

export const formSection = style({
  width: '100%',
  display: 'flex',
  flexDirection: 'column',
  gap: '12px',
});

export const formTitle = style({
  fontSize: '1.1rem',
  fontWeight: 600,
  color: vars.color.textPrimary,
});

export const serverGroup = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '12px',
});

export const divider = style({
  display: 'flex',
  alignItems: 'center',
  gap: '12px',
  color: vars.color.textMuted,
  fontSize: '0.85rem',
  '::before': {
    content: '""',
    flex: 1,
    height: '1px',
    backgroundColor: vars.color.border,
  },
  '::after': {
    content: '""',
    flex: 1,
    height: '1px',
    backgroundColor: vars.color.border,
  },
});

export const idpIcon = style({
  width: '18px',
  height: '18px',
  objectFit: 'contain',
});

export const checkingServer = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '10px',
  minHeight: '120px',
  color: vars.color.textMuted,
  fontSize: '0.9rem',
});

export const statusText = style({
  fontSize: '0.85rem',
  color: vars.color.error,
  textAlign: 'center',
  minHeight: '20px',
});

export const statusSuccess = style([statusText, { color: vars.color.success }]);

export const infoText = style({
  fontSize: '0.85rem',
  color: vars.color.textMuted,
  textAlign: 'center',
  minHeight: '20px',
});

export const switchText = style({
  fontSize: '0.85rem',
  color: vars.color.textMuted,
  textAlign: 'center',
});

export const switchLink = style({
  color: vars.color.accent,
  cursor: 'pointer',
  border: 'none',
  background: 'none',
  padding: 0,
  font: 'inherit',
  ':hover': {
    textDecoration: 'underline',
  },
});

export const passwordReqs = style({
  fontSize: '0.8rem',
  color: vars.color.textMuted,
  paddingLeft: '4px',
});

export const reqItem = style({
  lineHeight: '1.6',
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
});

export const strength = style({
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
  marginTop: '-4px',
  paddingLeft: '2px',
  fontSize: '0.8rem',
  color: vars.color.textMuted,
});

export const strengthBars = style({
  display: 'flex',
  gap: '4px',
  flex: 1,
});

export const strengthBar = style({
  flex: 1,
  height: '4px',
  borderRadius: '2px',
  backgroundColor: vars.color.border,
  transition: 'background-color 0.2s',
});

export const strengthBarWeak = style([strengthBar, { backgroundColor: vars.color.error }]);
export const strengthBarOkay = style([strengthBar, { backgroundColor: vars.color.warning }]);
export const strengthBarStrong = style([strengthBar, { backgroundColor: vars.color.success }]);

// ---------- server picker ----------

const TOUCH = '(max-width: 768px), (pointer: coarse)';
const NO_MOTION = '(prefers-reduced-motion: reduce)';

const appear = keyframes({
  from: { opacity: 0, transform: 'translateY(6px)' },
  to: { opacity: 1, transform: 'none' },
});
const spin = keyframes({ to: { transform: 'rotate(360deg)' } });

const linkLike = {
  color: vars.color.accent,
  cursor: 'pointer',
  border: 'none',
  background: 'none',
  padding: 0,
  font: 'inherit',
  ':hover': { textDecoration: 'underline' },
} as const;

export const server = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '6px',
});

export const serverLabelRow = style({
  display: 'flex',
  alignItems: 'baseline',
  justifyContent: 'space-between',
  gap: '8px',
  minHeight: '18px',
});

export const serverLabel = style({
  fontSize: '0.78rem',
  fontWeight: 700,
  letterSpacing: '0.04em',
  textTransform: 'uppercase',
  color: vars.color.textMuted,
});

export const serverDone = style({
  ...linkLike,
  fontSize: '0.85rem',
  fontWeight: 600,
  padding: '4px 6px',
  margin: '-4px -6px',
  '@media': { [TOUCH]: { padding: '10px 8px', margin: '-10px -8px' } },
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
  fontSize: '0.95rem',
  fontWeight: 600,
  color: vars.color.textPrimary,
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
});

export const serverChange = style({
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
  fontSize: '0.85rem',
  fontWeight: 600,
  whiteSpace: 'nowrap',
  cursor: 'pointer',
  ':hover': { backgroundColor: vars.color.bgHover },
  ':disabled': { opacity: 0.5, cursor: 'default' },
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

export const serverPresets = style({
  display: 'flex',
  flexWrap: 'wrap',
  gap: '6px',
});

export const serverPreset = style({
  minHeight: '32px',
  padding: '0 12px',
  borderRadius: '999px',
  border: `1px solid ${vars.color.border}`,
  backgroundColor: vars.color.bgSecondary,
  color: vars.color.textPrimary,
  font: 'inherit',
  fontSize: '0.82rem',
  cursor: 'pointer',
  ':hover': { backgroundColor: vars.color.bgHover },
  ':disabled': { opacity: 0.5, cursor: 'default' },
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
export const serverStatus = style({
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
  height: '18px',
  minWidth: 0,
  fontSize: '0.8rem',
  lineHeight: '18px',
  color: vars.color.textMuted,
  transition: 'opacity 150ms',
});
export const serverStatusStale = style({ opacity: 0.55 });
export const serverStatusOk = style({ color: vars.color.success });
export const serverStatusBad = style({ color: vars.color.error });

export const serverStatusText = style({
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  minWidth: 0,
});

/** The fixed-size slot at the start of the status line: a dot, or a spinner while checking. */
export const serverStatusMark = style({
  flexShrink: 0,
  width: '10px',
  height: '10px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
});
export const serverDot = style({
  width: '8px',
  height: '8px',
  borderRadius: '50%',
  backgroundColor: 'currentColor',
});
export const serverSpinner = style({
  width: '10px',
  height: '10px',
  borderRadius: '50%',
  border: '2px solid currentColor',
  borderRightColor: 'transparent',
  animation: `${spin} 700ms linear infinite`,
  '@media': { [NO_MOTION]: { animation: `${spin} 2s linear infinite` } },
});

export const serverRetry = style({ ...linkLike, flexShrink: 0, fontSize: '0.8rem' });

/** Read by screen readers, not shown. */
export const serverSrOnly = style({
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

export const backButton = style({
  position: 'absolute',
  top: '24px',
  left: '24px',
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px',
  padding: '8px 12px',
  border: 'none',
  borderRadius: vars.radius.sm,
  background: 'none',
  color: vars.color.textMuted,
  fontSize: '0.9rem',
  fontWeight: 500,
  cursor: 'pointer',
  ':hover': {
    color: vars.color.textPrimary,
    backgroundColor: vars.color.bgHover,
  },
  ':focus-visible': {
    outline: `2px solid ${vars.color.accent}`,
    outlineOffset: '2px',
  },
  selectors: {
    'html.desktop &': {
      top: `${24 + TITLE_BAR_HEIGHT}px`,
    },
  },
  '@media': {
    '(max-width: 768px)': {
      position: 'static',
      alignSelf: 'flex-start',
      marginLeft: '-12px',
    },
  },
});
