import { style } from '@vanilla-extract/css';
import { vars } from '@/theme/vars.css';
import { slideInRight, med, fast } from '@/theme/animations.css';

export const container = style({
  position: 'fixed',
  bottom: 'calc(20px + env(safe-area-inset-bottom))',
  right: 'calc(20px + env(safe-area-inset-right))',
  zIndex: 8000,
  display: 'flex',
  flexDirection: 'column',
  gap: '8px',
  pointerEvents: 'none',
});

export const toast = style({
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
  padding: '10px 16px',
  borderRadius: vars.radius.md,
  fontSize: '0.88rem',
  fontWeight: 500,
  color: vars.color.textPrimary,
  backgroundColor: vars.color.bgSecondary,
  border: `1px solid ${vars.color.border}`,
  boxShadow: '0 4px 14px rgba(0,0,0,0.22)',
  animation: `${slideInRight} ${med} ease-out`,
  pointerEvents: 'all',
  maxWidth: '360px',
});

const outline = (color: string) => style([toast, { borderColor: color }]);

export const toastInfo = outline(vars.color.accent);
export const toastSuccess = outline(vars.color.success);
export const toastError = outline(vars.color.error);
export const toastWarning = outline(vars.color.warning);

export const clickable = style({
  cursor: 'pointer',
  transition: `background-color ${fast}`,
  textAlign: 'left',
  font: 'inherit',
  selectors: {
    '&:hover': { backgroundColor: vars.color.bgHover },
    '&:focus-visible': { outline: `2px solid ${vars.color.accent}`, outlineOffset: '2px' },
  },
});

export const message = style({
  flex: 1,
  minWidth: 0,
});

export const action = style({
  fontWeight: 600,
  fontSize: '0.82rem',
  whiteSpace: 'nowrap',
  padding: '4px 10px',
  borderRadius: vars.radius.sm,
  backgroundColor: vars.color.bgTertiary,
  color: vars.color.textPrimary,
  transition: `background-color ${fast}`,
  selectors: {
    [`${clickable}:hover &`]: { backgroundColor: vars.color.bgActive },
  },
});
