import { style } from '@vanilla-extract/css';
import { vars } from '@/theme/vars.css';
import { fast } from '@/theme/animations.css';

export const userPanel = style({
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  height: '48px',
  padding: '0 14px',
});

export const userPanelIdentity = style({
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  minWidth: 0,
  maxWidth: '100%',
  padding: '6px 8px',
  marginTop: '-6px',
  marginBottom: '-6px',
  marginLeft: '-8px',
  marginRight: 'auto',
  borderRadius: vars.radius.sm,
  cursor: 'pointer',
  transition: `background-color ${fast}`,
  ':hover': {
    backgroundColor: vars.color.bgHover,
  },
});

export const userPanelId = style({
  fontSize: '0.82rem',
  color: vars.color.textMuted,
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});

export const voiceControls = style({
  display: 'flex',
  alignItems: 'center',
  gap: '4px',
  flexShrink: 0,
});

export const deafenStrike = style({
  position: 'relative',
  display: 'inline-flex',
});

export const deafenStrikeSlash = style({
  position: 'absolute',
  left: '50%',
  top: '50%',
  width: '22px',
  height: '2px',
  transform: 'translate(-50%, -50%) rotate(45deg)',
  pointerEvents: 'none',
});

export const deafenStrikeOutline = style({
  position: 'absolute',
  top: 0,
  left: '1px',
  right: '1px',
  height: '1px',
  borderRadius: '1px',
  background: vars.color.bgSecondary,
});

export const deafenStrikeCore = style({
  position: 'absolute',
  bottom: 0,
  left: '1px',
  right: '1px',
  height: '1px',
  borderRadius: '1px',
  background: 'currentColor',
});

export const avatarRing = style({
  display: 'inline-flex',
  flexShrink: 0,
  borderRadius: '50%',
  boxShadow: '0 0 0 2px transparent',
  transition: `box-shadow ${fast}`,
});

export const avatarRingSpeaking = style([
  avatarRing,
  { boxShadow: `0 0 0 2px ${vars.color.success}` },
]);
