import { style } from '@vanilla-extract/css';
import { vars } from '@/theme/vars.css';
import { fast } from '@/theme/animations.css';
import { navItem } from '@/app/components/Settings/Settings.css';

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
  fontSize: '0.9rem',
  fontWeight: 500,
  cursor: 'pointer',
  border: 'none',
  backgroundColor: vars.color.accent,
  color: '#fff',
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
  fontSize: '0.9rem',
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
  fontSize: '0.82rem',
  fontWeight: 600,
  color: vars.color.textMuted,
  letterSpacing: '0.05em',
  cursor: 'text',
});

export const statusText = style({
  fontSize: '0.85rem',
  flexShrink: 0,
});

export const versionText = style({
  color: vars.color.textMuted,
  fontSize: '0.9rem',
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
  fontSize: '0.95rem',
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
  fontSize: '0.82rem',
  color: vars.color.error,
});

export const clearBtn = style({
  border: 'none',
  background: 'none',
  color: vars.color.textMuted,
  cursor: 'pointer',
  fontSize: '0.9rem',
  display: 'flex',
  alignItems: 'center',
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
  fontSize: '0.8rem',
  color: vars.color.textMuted,
});

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
  fontSize: '0.8rem',
  color: vars.color.textMuted,
  whiteSpace: 'nowrap',
});

export const externalLink = style({
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px',
  color: vars.color.accent,
  textDecoration: 'none',
  fontSize: '0.9rem',
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

export const navFooter = style({
  marginTop: 'auto',
  paddingTop: '12px',
});

export const navLogout = style([
  navItem,
  {
    justifyContent: 'center',
    color: vars.color.error,
    ':hover': { color: vars.color.error },
  },
]);
