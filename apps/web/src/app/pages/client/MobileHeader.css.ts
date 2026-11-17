import { style } from '@vanilla-extract/css';
import { vars } from '@/theme/vars.css';
import { fast } from '@/theme/animations.css';
import { zIndex } from '@/theme/zIndex';
import { fontSize } from '@/theme/typeScale';

const iconBtn = style({
  width: '28px',
  height: '28px',
  borderRadius: vars.radius.sm,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
  border: 'none',
  color: vars.color.textMuted,
  fontSize: fontSize.rem90,
  transition: `background-color ${fast}, color ${fast}`,
  ':hover': {
    backgroundColor: vars.color.bgHover,
    color: vars.color.textPrimary,
  },
});

export const mobileHeader = style({
  display: 'none',
  '@media': {
    '(max-width: 768px)': {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      // The bar extends under the status bar / notch; its content sits below the inset.
      padding: 'var(--safe-top) calc(12px + var(--safe-right)) 0 calc(12px + var(--safe-left))',
      height: 'calc(48px + var(--safe-top))',
      boxSizing: 'border-box',
      flexShrink: 0,
      backgroundColor: vars.color.bgSecondary,
      borderBottom: `1px solid ${vars.color.border}`,
      position: 'sticky',
      top: 0,
      zIndex: zIndex.pinned,
    },
  },
});
export const mobileHeaderSpacer = style({
  width: '28px',
  flexShrink: 0,
});

export const mobileMenuBtn = style([
  iconBtn,
  {
    width: '36px',
    height: '36px',
    fontSize: fontSize.rem100,
  },
]);

export const mobileSearch = style({
  flex: 1,
  minWidth: 0,
  marginLeft: '8px',
});

export const mobileActions = style({
  display: 'flex',
  alignItems: 'center',
  gap: '4px',
});

export const mobileActionBtn = style([
  iconBtn,
  {
    width: '32px',
    height: '32px',
  },
]);

export const mobileHeaderTitle = style({
  fontWeight: 600,
  fontSize: fontSize.rem95,
  textAlign: 'center',
  position: 'absolute',
  left: 0,
  right: 0,
  top: 'var(--safe-top)',
  bottom: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '0 120px',
  pointerEvents: 'none',
});

export const mobileHeaderTitleText = style({
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});
