import { style } from '@vanilla-extract/css';
import { vars } from '@/theme/vars.css';
import { fontSize } from '@/theme/typeScale';

export const panel = style({
  width: '340px',
  flexShrink: 0,
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
  backgroundColor: vars.color.bgSecondary,
  borderLeft: `1px solid ${vars.color.border}`,
  '@media': { '(max-width: 768px)': { display: 'none' } },
});

export const list = style({
  flex: 1,
  minHeight: 0,
  overflowY: 'auto',
  display: 'flex',
  flexDirection: 'column',
  gap: '8px',
  padding: '12px',
});

export const empty = style({
  padding: '16px 4px',
  textAlign: 'center',
  fontSize: fontSize.sm,
  lineHeight: 1.5,
  color: vars.color.textMuted,
});

export const card = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '8px',
  padding: '10px 12px',
  borderRadius: vars.radius.md,
  backgroundColor: vars.color.bgSecondary,
  border: `1px solid ${vars.color.border}`,
});

export const room = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '1px',
  minWidth: 0,
});

const ellipsis = {
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
} as const;

export const roomName = style({
  ...ellipsis,
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
  fontSize: fontSize.sm,
  fontWeight: 600,
  color: vars.color.textPrimary,
});

export const liveIcon = style({ color: vars.color.success, flexShrink: 0 });

export const roomNameText = style({ ...ellipsis, minWidth: 0 });

export const spaceName = style({
  ...ellipsis,
  fontSize: fontSize.xs,
  color: vars.color.textMuted,
});

export const people = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '4px',
});

export const person = style({
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  minWidth: 0,
  fontSize: fontSize.sm,
  color: vars.color.textSecondary,
});

export const personKnown = style([person, { color: vars.color.textPrimary }]);

export const personName = style({ ...ellipsis, minWidth: 0 });

export const more = style({
  fontSize: fontSize.xs,
  color: vars.color.textMuted,
  paddingLeft: '28px',
});

// ---------- friends activity ----------

export const friendsCard = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '8px',
  padding: '10px 12px',
  marginTop: '4px',
  borderRadius: vars.radius.md,
  backgroundColor: vars.color.bgSecondary,
  border: `1px solid ${vars.color.border}`,
});

export const friendsHeader = style({
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  minWidth: 0,
});

export const friendsIcon = style({
  display: 'flex',
  flexShrink: 0,
  alignItems: 'center',
  justifyContent: 'center',
  width: '24px',
  height: '24px',
  borderRadius: '50%',
  color: vars.color.accent,
  backgroundColor: `rgba(${vars.color.accentRgb}, 0.14)`,
});

export const friendsTitle = style({
  minWidth: 0,
  fontSize: fontSize.sm,
  fontWeight: 600,
  color: vars.color.textPrimary,
});

export const friendsList = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '2px',
});

export const friendRow = style({
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
  width: '100%',
  minWidth: 0,
  padding: '6px 4px',
  border: 'none',
  borderRadius: vars.radius.sm,
  background: 'none',
  color: vars.color.textPrimary,
  font: 'inherit',
  textAlign: 'start',
  cursor: 'pointer',
  transition: 'background-color 150ms',
  ':hover': { backgroundColor: vars.color.bgHover },
  ':focus-visible': {
    outline: `2px solid ${vars.color.accent}`,
    outlineOffset: '-2px',
  },
});

export const friendText = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '2px',
  minWidth: 0,
  flex: 1,
});

export const friendName = style({
  ...ellipsis,
  fontSize: fontSize.sm,
  fontWeight: 600,
  color: vars.color.textPrimary,
});

export const friendActivity = style({
  ...ellipsis,
  display: 'flex',
  alignItems: 'center',
  gap: '5px',
  fontSize: fontSize.xs,
  color: vars.color.textMuted,
});

export const friendActivityIcon = style({
  flexShrink: 0,
  color: vars.color.accent,
});
