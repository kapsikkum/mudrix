import { style } from '@vanilla-extract/css';
import { vars } from '@/theme/vars.css';

export const stageRoot = style({
  flex: 1,
  minHeight: 0,
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
  position: 'relative',
});

export const stage = style({
  flex: 1,
  minHeight: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '24px',
  overflow: 'auto',
  backgroundSize: 'cover',
  backgroundPosition: 'center',
  backgroundRepeat: 'no-repeat',
});

export const stageContent = style({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: '12px',
  maxWidth: '480px',
  textAlign: 'center',
});

export const stageTitle = style({
  margin: 0,
  fontSize: '1.5rem',
  fontWeight: 700,
  color: vars.color.textPrimary,
  wordBreak: 'break-word',
});

export const stageNote = style({
  margin: 0,
  fontSize: '0.95rem',
  color: vars.color.textMuted,
});

export const stageActions = style({
  display: 'flex',
  flexWrap: 'wrap',
  justifyContent: 'center',
  gap: '10px',
  marginTop: '4px',
});

const stageButtonBase = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '8px',
  padding: '10px 20px',
  borderRadius: vars.radius.md,
  border: 'none',
  fontSize: '0.95rem',
  fontWeight: 600,
  cursor: 'pointer',
  transition: 'background-color 0.15s ease, opacity 0.15s ease',
} as const;

export const stageJoinBtn = style([
  stageButtonBase,
  {
    backgroundColor: vars.color.accent,
    color: '#fff',
    ':hover': { backgroundColor: vars.color.accentHover },
    ':disabled': { opacity: 0.5, cursor: 'not-allowed' },
    ':focus-visible': {
      outline: `2px solid ${vars.color.accent}`,
      outlineOffset: '2px',
    },
  },
]);

export const stageChatBtn = style([
  stageButtonBase,
  {
    backgroundColor: 'rgba(255,255,255,0.1)',
    color: vars.color.textPrimary,
    border: '1px solid rgba(255,255,255,0.16)',
    ':hover': { backgroundColor: vars.color.bgHover },
    ':focus-visible': {
      outline: `2px solid ${vars.color.accent}`,
      outlineOffset: '2px',
    },
  },
]);
