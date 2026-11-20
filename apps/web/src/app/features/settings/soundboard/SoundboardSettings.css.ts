import { style } from '@vanilla-extract/css';
import { vars } from '@/theme/vars.css';
import { fast, pulse } from '@/theme/animations.css';
import { fontSize } from '@/theme/typeScale';

export const packList = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '10px',
});

export const packCard = style({
  display: 'flex',
  alignItems: 'center',
  gap: '12px',
  padding: '16px',
  backgroundColor: vars.color.bgSecondary,
  border: `1px solid ${vars.color.border}`,
  borderRadius: vars.radius.md,
});

export const packCardPreview = style({
  width: '36px',
  height: '36px',
  borderRadius: '50%',
  backgroundColor: vars.color.bgTertiary,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
  overflow: 'hidden',
  fontSize: '1.25rem',
});

export const packCardInfo = style({
  flex: 1,
  minWidth: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: '2px',
});

export const packCardName = style({
  fontSize: fontSize.md,
  fontWeight: 600,
  color: vars.color.textPrimary,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});

export const packCardMeta = style({
  fontSize: fontSize.xs,
  color: vars.color.textMuted,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});

export const packCardActions = style({
  display: 'flex',
  alignItems: 'center',
  gap: '4px',
  flexShrink: 0,
});

export const emptyPacks = style({
  padding: '16px',
  textAlign: 'center',
  color: vars.color.textMuted,
  fontSize: fontSize.sm,
  backgroundColor: vars.color.bgSecondary,
  border: `1px dashed ${vars.color.border}`,
  borderRadius: vars.radius.md,
});

export const headerRow = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '12px',
  flexWrap: 'wrap',
});

export const headerButton = style({
  flexShrink: 0,
});

export const popEmpty = style({
  padding: '16px',
  textAlign: 'center',
  color: vars.color.textMuted,
  fontSize: fontSize.sm,
});

export const popList = style({
  width: '300px',
  maxHeight: '280px',
  overflowY: 'auto',
});

export const popRoomGroup = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '2px',
});

export const popRoomName = style({
  fontSize: fontSize.xs,
  fontWeight: 600,
  color: vars.color.textMuted,
  padding: '8px 10px 4px',
});

export const popPackRow = style({
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
  width: '100%',
  padding: '6px 10px',
  borderRadius: vars.radius.sm,
  border: 'none',
  background: 'none',
  cursor: 'pointer',
  color: vars.color.textPrimary,
  textAlign: 'left',
  fontSize: fontSize.sm,
  transition: `background-color ${fast}`,
  ':hover': { backgroundColor: vars.color.bgHover },
});

export const popPackRowSelected = style([
  popPackRow,
  {
    backgroundColor: vars.color.bgActive,
    ':hover': { backgroundColor: vars.color.bgActive },
  },
]);

export const popPackThumb = style({
  width: '24px',
  height: '24px',
  borderRadius: '50%',
  backgroundColor: vars.color.bgTertiary,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
  overflow: 'hidden',
});

export const popPackName = style({
  flex: 1,
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});

export const popPackCheckbox = style({
  width: '18px',
  height: '18px',
  borderRadius: '4px',
  border: `2px solid ${vars.color.border}`,
  backgroundColor: 'transparent',
  flexShrink: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: '#fff',
  transition: `background-color ${fast}, border-color ${fast}`,
});

export const popPackCheckboxSelected = style({
  borderColor: vars.color.accent,
  backgroundColor: vars.color.accent,
});

export const skeleton = style({
  borderRadius: vars.radius.sm,
  backgroundColor: vars.color.bgTertiary,
  animation: `${pulse} 1.4s ease-in-out infinite`,
});

export const errorText = style({
  color: vars.color.danger,
  fontSize: fontSize.sm,
  marginTop: '8px',
});
