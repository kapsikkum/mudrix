import { style, styleVariants } from '@vanilla-extract/css';
import { vars } from '@/theme/vars.css';
import { med } from '@/theme/animations.css';

// Hidden native checkbox
export const nativeInput = style({
  position: 'absolute',
  opacity: 0,
  width: 0,
  height: 0,
  pointerEvents: 'none',
});

// Track (the pill background)
const trackBase = style({
  position: 'relative',
  display: 'inline-flex',
  alignItems: 'center',
  borderRadius: '999px',
  backgroundColor: vars.color.bgTertiary,
  border: `1px solid ${vars.color.border}`,
  cursor: 'pointer',
  flexShrink: 0,
  transition: `background-color ${med}, border-color ${med}`,
  selectors: {
    '&:has(input:focus-visible)': {
      outline: `2px solid ${vars.color.accent}`,
      outlineOffset: '2px',
    },
  },
});

export const trackSizes = styleVariants({
  sm: [trackBase, { width: '36px', height: '20px' }],
  md: [trackBase, { width: '44px', height: '24px' }],
});

export const trackChecked = style({
  backgroundColor: vars.color.accent,
  borderColor: vars.color.accent,
});

export const trackDisabled = style({
  opacity: 0.5,
  cursor: 'not-allowed',
});

const thumbBase = style({
  position: 'absolute',
  borderRadius: '50%',
  backgroundColor: '#fff',
  transition: `transform ${med}`,
});

export const thumbSizes = styleVariants({
  sm: [thumbBase, { width: '14px', height: '14px', left: '2px', transform: 'translateX(0)' }],
  md: [thumbBase, { width: '18px', height: '18px', left: '2px', transform: 'translateX(0)' }],
});

export const thumbCheckedSizes = styleVariants({
  sm: { transform: 'translateX(16px)' },
  md: { transform: 'translateX(20px)' },
});

export const row = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '12px 0',
  gap: '16px',
});

export const rowInfo = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '2px',
  flex: 1,
});

export {
  settingLabel as rowLabel,
  settingNote as rowDescription,
} from '@/app/components/Settings/Settings.css';
