import { style } from '@vanilla-extract/css';
import { vars } from '@/theme/vars.css';

export const deviceList = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '8px',
  marginTop: '4px',
});

export const deviceCard = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '12px',
  padding: '12px 14px',
  backgroundColor: vars.color.bgSecondary,
  border: `1px solid ${vars.color.border}`,
  borderRadius: vars.radius.md,
});

export const deviceCardCurrent = style([
  deviceCard,
  {
    borderColor: vars.color.accent,
    backgroundColor: `color-mix(in srgb, ${vars.color.accent} 6%, ${vars.color.bgSecondary})`,
  },
]);

export const deviceRow = style({
  display: 'flex',
  alignItems: 'center',
  gap: '12px',
});

export const deviceIconWrap = style({
  position: 'relative',
  width: '36px',
  height: '36px',
  flexShrink: 0,
});

export const deviceIcon = style({
  width: '36px',
  height: '36px',
  borderRadius: '50%',
  backgroundColor: vars.color.bgTertiary,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: vars.color.textMuted,
  fontSize: '1rem',
});

export const deviceDotUnverified = style({
  position: 'absolute',
  right: '-3px',
  bottom: '-3px',
  width: '12px',
  height: '12px',
  borderRadius: '50%',
  backgroundColor: vars.color.danger,
  border: `2px solid ${vars.color.bgPrimary}`,
  zIndex: 1,
  cursor: 'default',
});

export const deviceDotVerified = style({
  position: 'absolute',
  right: '-3px',
  bottom: '-3px',
  width: '12px',
  height: '12px',
  borderRadius: '50%',
  backgroundColor: vars.color.success,
  border: `2px solid ${vars.color.bgPrimary}`,
  zIndex: 1,
  cursor: 'default',
});

export const deviceInfo = style({
  flex: 1,
  minWidth: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: '2px',
});

export const deviceName = style({
  fontSize: '0.9rem',
  fontWeight: 600,
  color: vars.color.textPrimary,
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
  flexWrap: 'wrap',
});

export const expandBtn = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '2px',
  borderRadius: vars.radius.sm,
  border: 'none',
  background: 'none',
  color: vars.color.textMuted,
  cursor: 'pointer',
  flexShrink: 0,
  ':hover': { backgroundColor: vars.color.bgHover, color: vars.color.textPrimary },
  ':focus-visible': {
    outline: `2px solid ${vars.color.accent}`,
    outlineOffset: '1px',
  },
});

export const editForm = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '6px',
  minWidth: 0,
});

export const nameInput = style({
  padding: '6px 9px',
  backgroundColor: vars.color.bgInput,
  color: vars.color.textPrimary,
  border: `1px solid ${vars.color.border}`,
  borderRadius: vars.radius.sm,
  fontSize: '0.85rem',
  outline: 'none',
  width: '100%',
  boxSizing: 'border-box',
  ':focus': { borderColor: vars.color.accent },
  ':disabled': { opacity: 0.6 },
});

export const editActions = style({
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
});

export const editCancelBtn = style({
  padding: '5px 10px',
  borderRadius: vars.radius.sm,
  fontSize: '0.8rem',
  fontWeight: 500,
  cursor: 'pointer',
  border: 'none',
  background: 'none',
  color: vars.color.textMuted,
  ':hover': { backgroundColor: vars.color.bgHover, color: vars.color.textPrimary },
  ':disabled': { opacity: 0.45, cursor: 'not-allowed' },
});

export const renameHint = style({
  fontSize: '0.72rem',
  color: vars.color.textMuted,
  margin: 0,
  lineHeight: '1.4',
});

export const deviceDetails = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '6px',
  padding: '10px 12px',
  borderRadius: vars.radius.sm,
  backgroundColor: vars.color.bgTertiary,
});

export const detailRow = style({
  display: 'flex',
  alignItems: 'baseline',
  gap: '12px',
  fontSize: '0.82rem',
});

export const detailLabel = style({
  color: vars.color.textMuted,
  flexShrink: 0,
  textTransform: 'capitalize',
});

export const detailValue = style({
  color: vars.color.textPrimary,
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});

export const detailValueMono = style({
  fontFamily: 'monospace',
  fontSize: '0.78rem',
});

export const actions = style({
  display: 'flex',
  gap: '6px',
  flexShrink: 0,
});

const actionBtnBase = style({
  padding: '5px 12px',
  borderRadius: vars.radius.sm,
  fontSize: '0.8rem',
  fontWeight: 500,
  cursor: 'pointer',
  border: 'none',
  ':disabled': { opacity: 0.45, cursor: 'not-allowed' },
});

export const verifyBtn = style([
  actionBtnBase,
  {
    backgroundColor: vars.color.accent,
    color: '#fff',
    ':hover': { backgroundColor: vars.color.accentHover },
  },
]);

export const removeBtn = style([
  actionBtnBase,
  {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '7px',
    backgroundColor: 'transparent',
    color: vars.color.danger,
    ':hover': { backgroundColor: vars.color.bgHover, color: vars.color.danger },
  },
]);

export const deviceMenuBtn = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '6px',
  borderRadius: vars.radius.sm,
  border: 'none',
  background: 'none',
  color: vars.color.textMuted,
  cursor: 'pointer',
  flexShrink: 0,
  ':hover': { backgroundColor: vars.color.bgHover, color: vars.color.textPrimary },
  ':disabled': { opacity: 0.45, cursor: 'not-allowed' },
});

export const recoveryKeyBox = style({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'flex-start',
  gap: '8px',
  padding: '14px',
  borderRadius: vars.radius.md,
  border: `1px solid ${vars.color.danger}`,
  backgroundColor: `color-mix(in srgb, ${vars.color.danger} 8%, ${vars.color.bgSecondary})`,
});

export const recoveryKeyHint = style({
  fontSize: '0.78rem',
  color: vars.color.textMuted,
  lineHeight: '1.5',
});

export const recoveryKeyActions = style({
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  flexWrap: 'wrap',
});

export const uiaPanel = style({
  margin: '0 0 20px',
  padding: '20px',
  backgroundColor: `color-mix(in srgb, ${vars.color.accent} 5%, ${vars.color.bgSecondary})`,
  border: `1px solid ${vars.color.accent}`,
  borderRadius: vars.radius.md,
  display: 'flex',
  flexDirection: 'column',
  gap: '12px',
});

export const uiaPanelHeader = style({
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  fontSize: '0.9rem',
  fontWeight: 600,
  color: vars.color.textPrimary,
});

export const uiaPanelDesc = style({
  fontSize: '0.82rem',
  color: vars.color.textMuted,
  lineHeight: '1.55',
});

export const uiaForm = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '10px',
});

export const uiaActions = style({
  display: 'flex',
  gap: '8px',
  alignItems: 'center',
});

export const uiaError = style({
  fontSize: '0.8rem',
  color: vars.color.error,
});

export const uiaSso = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '8px',
});

export const uiaSsoDivider = style({
  fontSize: '0.78rem',
  color: vars.color.textMuted,
  textAlign: 'center',
});

export const uiaUnsupported = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '10px',
  fontSize: '0.85rem',
  color: vars.color.textMuted,
});

export const emptyState = style({
  fontSize: '0.9rem',
  color: vars.color.textMuted,
  textAlign: 'center',
  padding: '24px 0',
});

export const sessionNote = style({
  marginBottom: '14px',
});

export const sessionActions = style({
  display: 'flex',
  justifyContent: 'flex-end',
  gap: '8px',
  marginBottom: '16px',
});

export const spinner = style({
  display: 'flex',
  justifyContent: 'center',
  padding: '24px 0',
  color: vars.color.textMuted,
});
