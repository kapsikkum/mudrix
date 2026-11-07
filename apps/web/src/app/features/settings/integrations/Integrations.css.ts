import { style } from '@vanilla-extract/css';
import { vars } from '@/theme/vars.css';

export const intro = style({
  fontSize: '0.9rem',
  color: vars.color.textMuted,
  lineHeight: 1.5,
  marginBottom: '24px',
});

export const list = style({
  listStyle: 'none',
  margin: 0,
  padding: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: '10px',
});

export const card = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '10px',
  padding: '12px',
  backgroundColor: vars.color.bgTertiary,
  border: `1px solid ${vars.color.border}`,
  borderRadius: vars.radius.md,
});

export const head = style({
  display: 'flex',
  alignItems: 'center',
  gap: '12px',
  flexWrap: 'wrap',
});

export const iconTile = style({
  width: '40px',
  height: '40px',
  flexShrink: 0,
  borderRadius: vars.radius.sm,
  backgroundColor: vars.color.bgInput,
  color: vars.color.textPrimary,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontWeight: 700,
  fontSize: '1.1rem',
  objectFit: 'cover',
});

export const info = style({
  flex: 1,
  minWidth: '160px',
  display: 'flex',
  flexDirection: 'column',
  gap: '2px',
});

export const name = style({
  fontSize: '0.95rem',
  fontWeight: 600,
  color: vars.color.textPrimary,
  overflowWrap: 'anywhere',
});

export const muted = style({
  fontSize: '0.82rem',
  color: vars.color.textMuted,
  lineHeight: 1.5,
  overflowWrap: 'anywhere',
});

export const mono = style({
  fontFamily: 'monospace',
  fontSize: '0.8rem',
  color: vars.color.textMuted,
  overflowWrap: 'anywhere',
});

export const row = style({
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  flexWrap: 'wrap',
});

export const disclosure = style({
  fontSize: '0.85rem',
  color: vars.color.textPrimary,
});

export const summary = style({
  cursor: 'pointer',
  fontWeight: 500,
  padding: '4px 0',
  borderRadius: vars.radius.sm,
  ':focus-visible': { outline: `2px solid ${vars.color.accent}`, outlineOffset: '2px' },
});

export const perm = style({
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'space-between',
  gap: '12px',
  padding: '8px 0',
});

/** A setting's control (a text field or a list) next to its label: a fixed share, not all of the row. */
export const settingControl = style({
  flex: '0 1 260px',
  minWidth: 0,
});

export const permBody = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '4px',
  minWidth: 0,
});

export const permTitle = style({
  fontSize: '0.85rem',
  fontWeight: 600,
  color: vars.color.textPrimary,
});

export const permList = style({
  margin: 0,
  paddingLeft: '18px',
  fontSize: '0.82rem',
  color: vars.color.textPrimary,
  lineHeight: 1.5,
  overflowWrap: 'anywhere',
});

export const code = style({
  fontFamily: 'monospace',
  padding: '0 4px',
  borderRadius: vars.radius.sm,
  backgroundColor: vars.color.bgInput,
  whiteSpace: 'pre-wrap',
});

export const banner = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '8px',
  padding: '10px 12px',
  borderRadius: vars.radius.sm,
  border: `1px solid ${vars.color.warning}`,
  backgroundColor: vars.color.bgSecondary,
});

export const bannerTitle = style({
  fontSize: '0.9rem',
  fontWeight: 600,
  color: vars.color.warning,
});

export const errorText = style({
  fontSize: '0.82rem',
  color: vars.color.error,
  overflowWrap: 'anywhere',
});

export const addRow = style({
  display: 'flex',
  alignItems: 'flex-start',
  gap: '8px',
  marginTop: '12px',
  marginBottom: '16px',
  flexWrap: 'wrap',
});

export const addInput = style({
  flex: 1,
  minWidth: '200px',
});

export const consentBody = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '12px',
});

export const nameRow = style({
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  flexWrap: 'wrap',
});

export const officialBadge = style({
  flexShrink: 0,
  padding: '1px 8px',
  borderRadius: '999px',
  border: `1px solid ${vars.color.accent}`,
  color: vars.color.accent,
  fontSize: '0.75rem',
  fontWeight: 700,
  lineHeight: 1.5,
});

export const fingerprintSmall = style({
  fontFamily: 'monospace',
  fontSize: '0.8rem',
  color: vars.color.textMuted,
  letterSpacing: '0.04em',
  fontVariantNumeric: 'tabular-nums',
  userSelect: 'all',
  overflowWrap: 'anywhere',
});

export const fingerprintLarge = style({
  fontFamily: 'monospace',
  fontSize: '1.1rem',
  fontWeight: 600,
  color: vars.color.textPrimary,
  letterSpacing: '0.1em',
  fontVariantNumeric: 'tabular-nums',
  lineHeight: 1.7,
  userSelect: 'all',
  padding: '10px 12px',
  borderRadius: vars.radius.sm,
  backgroundColor: vars.color.bgInput,
  border: `1px solid ${vars.color.border}`,
  overflowWrap: 'anywhere',
});

export const keyChangedBlock = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '6px',
  padding: '12px 14px',
  borderRadius: vars.radius.sm,
  border: `2px solid ${vars.color.danger}`,
  backgroundColor: vars.color.bgSecondary,
  color: vars.color.textPrimary,
  fontSize: '0.85rem',
  lineHeight: 1.5,
});

export const securityError = style({
  fontSize: '0.82rem',
  color: vars.color.danger,
  fontWeight: 600,
  overflowWrap: 'anywhere',
});

export const integrationNames = style({
  margin: 0,
  paddingLeft: '18px',
  fontSize: '0.85rem',
  color: vars.color.textPrimary,
  lineHeight: 1.6,
  overflowWrap: 'anywhere',
});

export const sourceLine = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '4px',
  fontSize: '0.85rem',
  fontWeight: 600,
  color: vars.color.textPrimary,
});

export const keyChangedHead = style({
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  color: vars.color.danger,
  fontSize: '0.95rem',
  fontWeight: 700,
});
