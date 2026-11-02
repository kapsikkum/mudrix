import { style } from '@vanilla-extract/css';
import { vars } from '@/theme/vars.css';
import { fast, med } from '@/theme/animations.css';

const controlHeight = '36px';

export const dialogBody = style({
  selectors: {
    '&&': {
      padding: 0,
      gap: 0,
      overflow: 'hidden',
    },
  },
});

export const controlsRow = style({
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
  padding: '14px 20px',
});

export const filterSelect = style({
  boxSizing: 'border-box',
  height: controlHeight,
});

export const searchFilterSlot = style({
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
  flex: 1,
  minWidth: 0,
  overflow: 'hidden',
  transition: `opacity ${med} ease, transform ${med} ease, max-width ${med} ease`,
});

export const searchFilterSlotVisible = style([
  searchFilterSlot,
  {
    opacity: 1,
    transform: 'translateX(0)',
    maxWidth: '1000px',
    pointerEvents: 'auto',
  },
]);

export const searchFilterSlotHidden = style([
  searchFilterSlot,
  {
    opacity: 0,
    transform: 'translateX(-18px)',
    maxWidth: '0px',
    pointerEvents: 'none',
  },
]);

export const pillGroup = style({
  display: 'flex',
  alignItems: 'stretch',
  gap: '2px',
  boxSizing: 'border-box',
  height: controlHeight,
  backgroundColor: vars.color.bgTertiary,
  borderRadius: vars.radius.sm,
  padding: '3px',
  flexShrink: 0,
});

const pillBase = style({
  display: 'flex',
  alignItems: 'center',
  boxSizing: 'border-box',
  height: '100%',
  padding: '0 12px',
  borderRadius: vars.radius.sm,
  border: 'none',
  background: 'transparent',
  color: vars.color.textMuted,
  fontFamily: vars.font.body,
  fontSize: '0.9rem',
  fontWeight: 500,
  lineHeight: '1',
  whiteSpace: 'nowrap',
});

export const pill = style([
  pillBase,
  {
    cursor: 'pointer',
    transition: `background-color ${fast}, color ${fast}`,
    ':hover': {
      color: vars.color.textPrimary,
    },
  },
]);

export const pillActive = style([
  pill,
  {
    backgroundColor: vars.color.bgSecondary,
    color: vars.color.textPrimary,
  },
]);

export const pillOtherWrapper = style([
  pillBase,
  {
    gap: '6px',
    padding: '0 10px',
    cursor: 'default',
    flexShrink: 0,
    transition: `background-color ${fast}`,
  },
]);

export const pillOtherWrapperActive = style([
  pillOtherWrapper,
  {
    backgroundColor: vars.color.bgSecondary,
  },
]);

export const pillOtherInput = style({
  background: 'none',
  border: 'none',
  outline: 'none',
  padding: 0,
  minWidth: 0,
  color: vars.color.textMuted,
  fontFamily: vars.font.body,
  fontSize: '0.9rem',
  fontWeight: 500,
  lineHeight: '1',
  width: '38px',
  cursor: 'pointer',
  transition: `width ${med} ease`,
  '::placeholder': {
    color: vars.color.textMuted,
  },
});

export const pillOtherInputActive = style([
  pillOtherInput,
  {
    width: '120px',
    cursor: 'text',
    color: vars.color.textPrimary,
    '::placeholder': {
      color: vars.color.textMuted,
    },
  },
]);

export const pillGoBtn = style({
  display: 'flex',
  alignItems: 'center',
  background: 'none',
  border: 'none',
  color: vars.color.textMuted,
  cursor: 'pointer',
  padding: 0,
  lineHeight: 0,
  ':hover': {
    color: vars.color.textPrimary,
  },
});

export const searchWrapper = style({
  flex: 1,
  minWidth: '160px',
  position: 'relative',
  display: 'flex',
  alignItems: 'center',
});

export const searchIcon = style({
  position: 'absolute',
  left: '10px',
  color: vars.color.textMuted,
  pointerEvents: 'none',
  display: 'flex',
  alignItems: 'center',
});

export const searchInput = style({
  width: '100%',
  boxSizing: 'border-box',
  height: controlHeight,
  padding: '0 12px 0 32px',
  borderRadius: vars.radius.sm,
  border: `1px solid ${vars.color.border}`,
  backgroundColor: vars.color.bgInput,
  color: vars.color.textPrimary,
  fontSize: '0.9rem',
  fontFamily: vars.font.body,
  outline: 'none',
  transition: `border-color ${fast}`,
  ':focus': {
    borderColor: vars.color.accent,
  },
  '::placeholder': {
    color: vars.color.textMuted,
  },
});

export const scrollArea = style({
  flex: 1,
  overflowY: 'auto',
  overflowX: 'hidden',
  padding: '20px',
  minWidth: 0,
});

export const sectionTitle = style({
  fontSize: '0.75rem',
  fontWeight: 700,
  letterSpacing: '0.06em',
  color: vars.color.textMuted,
  marginBottom: '12px',
});

export const roomGrid = style({
  display: 'grid',
  gridTemplateColumns: 'repeat(3, 1fr)',
  gap: '12px',
  marginBottom: '16px',
  minWidth: 0,
  width: '100%',
  '@media': {
    '(max-width: 860px)': {
      gridTemplateColumns: 'repeat(2, 1fr)',
    },
    '(max-width: 560px)': {
      gridTemplateColumns: '1fr',
    },
  },
});

export const roomCard = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '8px',
  padding: '14px',
  borderRadius: vars.radius.md,
  backgroundColor: vars.color.bgPrimary,
  border: `1px solid ${vars.color.border}`,
  transition: `border-color ${fast}, box-shadow ${fast}`,
  minWidth: 0,
  overflow: 'hidden',
  ':hover': {
    borderColor: vars.color.accent,
    boxShadow: `0 0 0 1px ${vars.color.accent}28`,
  },
});

export const cardTop = style({
  display: 'flex',
  alignItems: 'flex-start',
  gap: '10px',
});

export const cardAvatar = style({
  width: '40px',
  height: '40px',
  borderRadius: vars.radius.sm,
  flexShrink: 0,
  fontSize: '1rem',
  fontWeight: 700,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  overflow: 'hidden',
  color: '#fff',
});

export const cardInfo = style({
  flex: 1,
  minWidth: 0,
});

export const cardName = style({
  fontWeight: 600,
  fontSize: '0.9rem',
  color: vars.color.textPrimary,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});

export const cardAlias = style({
  fontSize: '0.74rem',
  color: vars.color.textMuted,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  marginTop: '2px',
});

export const cardTypeBadge = style({
  fontSize: '0.66rem',
  fontWeight: 700,

  letterSpacing: '0.04em',
  padding: '2px 7px',
  borderRadius: '99px',
  backgroundColor: `${vars.color.accent}20`,
  color: vars.color.accent,
  flexShrink: 0,
});

export const cardTopic = style({
  fontSize: '0.8rem',
  color: vars.color.textSecondary,
  overflow: 'hidden',
  display: '-webkit-box',
  WebkitLineClamp: 2,
  WebkitBoxOrient: 'vertical',
  lineHeight: '1.45',
  flex: 1,
});

export const cardFooter = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  marginTop: 'auto',
  paddingTop: '4px',
});

export const cardMembers = style({
  fontSize: '0.76rem',
  color: vars.color.textMuted,
  display: 'flex',
  alignItems: 'center',
  gap: '4px',
});

export const joinBtn = style({
  padding: '4px 14px',
  borderRadius: vars.radius.sm,
  border: 'none',
  backgroundColor: vars.color.accent,
  color: '#fff',
  fontSize: '0.78rem',
  fontWeight: 600,
  cursor: 'pointer',
  transition: `background-color ${fast}, opacity ${fast}`,
  flexShrink: 0,
  ':hover': {
    backgroundColor: vars.color.accentHover,
  },
  ':disabled': {
    opacity: 0.5,
    cursor: 'not-allowed',
  },
});

export const joinedBadge = style({
  padding: '4px 10px',
  borderRadius: vars.radius.sm,
  border: `1px solid ${vars.color.success}`,
  color: vars.color.success,
  fontSize: '0.78rem',
  fontWeight: 600,
  flexShrink: 0,
});

export const paginationRow = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '8px',
  paddingTop: '8px',
  paddingBottom: '4px',
});

export const pageBtn = style({
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
  padding: '6px 12px',
  borderRadius: vars.radius.sm,
  border: `1px solid ${vars.color.border}`,
  backgroundColor: vars.color.bgSecondary,
  color: vars.color.textPrimary,
  fontFamily: vars.font.body,
  fontSize: '0.85rem',
  fontWeight: 500,
  cursor: 'pointer',
  flexShrink: 0,
  transition: `background-color ${fast}, color ${fast}, border-color ${fast}`,
  ':hover': {
    backgroundColor: vars.color.bgHover,
    borderColor: vars.color.accent,
    color: vars.color.textPrimary,
  },
  ':focus-visible': {
    borderColor: vars.color.accent,
    outline: 'none',
  },
  ':disabled': {
    opacity: 0.5,
    cursor: 'not-allowed',
  },
});

export const pageIndicator = style({
  fontSize: '0.85rem',
  color: vars.color.textMuted,
  padding: '0 4px',
  userSelect: 'none',
});

export const emptyState = style({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  height: '100%',
  gap: '14px',
  padding: '0 40px',
  textAlign: 'center',
  color: vars.color.textMuted,
});

export const emptyTitle = style({
  color: vars.color.textPrimary,
  fontSize: '1.05rem',
  fontWeight: 600,
});

export const emptyBody = style({
  fontSize: '0.88rem',
  lineHeight: '1.55',
  maxWidth: '340px',
});

export const skeletonGrid = style({
  display: 'grid',
  gridTemplateColumns: 'repeat(3, 1fr)',
  gap: '12px',
  minWidth: 0,
  width: '100%',
  '@media': {
    '(max-width: 860px)': {
      gridTemplateColumns: 'repeat(2, 1fr)',
    },
  },
});

export const skeletonCard = style({
  height: '120px',
  borderRadius: vars.radius.md,
  backgroundColor: vars.color.bgPrimary,
  border: `1px solid ${vars.color.border}`,
  opacity: 0.55,
  selectors: {
    '&:nth-child(even)': {
      opacity: 0.35,
    },
  },
});

export const errorBanner = style({
  margin: '0 0 16px',
  padding: '12px 16px',
  borderRadius: vars.radius.md,
  backgroundColor: `${vars.color.error}18`,
  border: `1px solid ${vars.color.error}44`,
  color: vars.color.error,
  fontSize: '0.85rem',
  textAlign: 'center',
});
