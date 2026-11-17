import { style, globalStyle, keyframes } from '@vanilla-extract/css';
import { vars } from '@/theme/vars.css';
import { fast, med } from '@/theme/animations.css';
import { zIndex } from '@/theme/zIndex';
import { fontSize } from '@/theme/typeScale';

export const composerWrap = style({
  backgroundColor: vars.color.bgSecondary,
  padding: '0 8px 9px',
  display: 'flex',
  flexDirection: 'column',
  gap: '6px',
  flexShrink: 0,
  position: 'relative',
});

export const hiddenInput = style({
  display: 'none',
});

export const popoverLayerFixed = style({
  position: 'fixed',
  zIndex: zIndex.panel,
});

export const replyPreview = style({
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  minWidth: 0,
  padding: '6px 8px 6px 14px',
  borderBottom: `1px solid ${vars.color.border}`,
  fontSize: fontSize.rem85,
  color: vars.color.textMuted,
});

export const replyIcon = style({
  flexShrink: 0,
});

export const replyText = style({
  flex: 1,
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});

export const replyName = style({
  color: vars.color.textPrimary,
  fontWeight: 600,
});

export const replySnippet = style({
  marginLeft: '6px',
});

export const statusStrip = style([replyPreview, { position: 'relative' }]);

export const uploadStrip = style([statusStrip, { paddingBottom: '12px' }]);

export const statusName = style({
  color: vars.color.textPrimary,
  fontWeight: 600,
});

export const statusMeta = style({
  marginLeft: '6px',
});

export const uploadProgressTrack = style({
  position: 'absolute',
  left: '14px',
  right: '8px',
  bottom: '4px',
  height: '3px',
  borderRadius: '2px',
  backgroundColor: vars.color.border,
  overflow: 'hidden',
});

export const uploadProgressFill = style({
  height: '100%',
  borderRadius: '2px',
  backgroundColor: vars.color.accent,
  transition: `width ${med} ease`,
});

export const replyCancel = style({
  marginLeft: 'auto',
  background: 'none',
  border: 'none',
  color: vars.color.textMuted,
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '2px 4px',
  borderRadius: vars.radius.sm,
  ':hover': { color: vars.color.textPrimary, backgroundColor: vars.color.bgHover },
});

const TOOLBAR_GAP = 6;
const TOOLBAR_HEIGHT = 38;
const TOOLBAR_ABOVE = `calc(100% + ${TOOLBAR_HEIGHT + TOOLBAR_GAP}px)`;

export const inputArea = style({
  position: 'relative',
});

export const floatingToolbar = style({
  position: 'absolute',
  bottom: '100%',
  left: 0,
  marginBottom: `${TOOLBAR_GAP}px`,
  display: 'flex',
  alignItems: 'center',
  gap: '2px',
  padding: '4px 6px',
  backgroundColor: vars.color.bgPrimary,
  border: `1px solid ${vars.color.border}`,
  borderRadius: vars.radius.md,
  boxShadow: '0 4px 16px rgba(0,0,0,0.35)',
  zIndex: zIndex.pinnedHigh,
  pointerEvents: 'auto',
});

export const fmtBtn = style({
  width: '28px',
  height: '28px',
  borderRadius: vars.radius.sm,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
  border: 'none',
  background: 'none',
  color: vars.color.textMuted,
  fontSize: fontSize.rem82,
  flexShrink: 0,
  ':hover': { backgroundColor: vars.color.bgHover, color: vars.color.textPrimary },
});

export const fmtBtnActive = style({
  width: '28px',
  height: '28px',
  borderRadius: vars.radius.sm,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
  border: 'none',
  background: 'none',
  color: vars.color.accent,
  fontSize: fontSize.rem82,
  flexShrink: 0,
  ':hover': { backgroundColor: vars.color.bgHover, color: vars.color.accent },
});

export const composerBox = style({
  minWidth: 0,
  overflow: 'hidden',
  backgroundColor: vars.color.bgTertiary,
  border: `1px solid ${vars.color.border}`,
  borderRadius: vars.radius.md,
  transition: `border-color ${fast}, box-shadow ${fast}`,
  ':focus-within': {
    borderColor: vars.color.accent,
    boxShadow: `0 0 0 2px color-mix(in srgb, ${vars.color.accent} 18%, transparent)`,
  },
});

export const inputRow = style({
  display: 'flex',
  alignItems: 'center',
  gap: '4px',
  minWidth: 0,
  minHeight: '48px',
  overflowX: 'hidden',
  padding: '0 14px',
});

export const attachBtn = style({
  width: '28px',
  height: '28px',
  borderRadius: vars.radius.sm,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
  border: 'none',
  background: 'none',
  color: vars.color.textMuted,
  fontSize: fontSize.rem95,
  flexShrink: 0,
  transition: `background-color ${fast}, color ${fast}`,
  ':hover': { backgroundColor: vars.color.bgHover, color: vars.color.textPrimary },
});

export const textarea = style({
  flex: 1,
  resize: 'none',
  minHeight: '32px',
  maxHeight: '180px',
  padding: '6px 8px',
  backgroundColor: 'transparent',
  color: vars.color.textPrimary,
  border: 'none',
  outline: 'none',
  fontSize: '0.97rem',
  lineHeight: '1.5',
  fontFamily: 'inherit',
  overflowY: 'hidden',
  '::placeholder': { color: vars.color.textMuted },
});

// Slate contentEditable editor replacing the textarea in the composer.
export const richEditor = style({
  flex: 1,
  minWidth: 0,
  minHeight: '32px',
  maxHeight: '180px',
  padding: '6px 8px',
  backgroundColor: 'transparent',
  color: vars.color.textPrimary,
  border: 'none',
  outline: 'none',
  fontSize: '0.97rem',
  lineHeight: '1.5',
  fontFamily: 'inherit',
  overflowY: 'auto',
  overflowX: 'hidden',
  wordBreak: 'break-word',
});

globalStyle(`${richEditor} p`, { margin: 0 });
globalStyle(`${richEditor} p + p`, { marginTop: '2px' });
globalStyle(`${richEditor} blockquote`, {
  margin: '2px 0',
  paddingLeft: '10px',
  borderLeft: `3px solid ${vars.color.accent}`,
  color: vars.color.textMuted,
});
globalStyle(`${richEditor} pre`, {
  margin: '2px 0',
  padding: '4px 8px',
  backgroundColor: vars.color.bgTertiary,
  borderRadius: vars.radius.sm,
  fontFamily: 'monospace',
  fontSize: fontSize.em90,
  overflowX: 'auto',
});
globalStyle(`${richEditor} code`, {
  backgroundColor: vars.color.bgTertiary,
  borderRadius: '3px',
  padding: '1px 4px',
  fontFamily: 'monospace',
  fontSize: fontSize.em90,
});
globalStyle(`${richEditor} a`, {
  color: vars.color.link,
  textDecoration: 'underline',
  cursor: 'pointer',
});
globalStyle(`${richEditor} [data-slate-placeholder]`, {
  color: `${vars.color.textMuted} !important`,
  pointerEvents: 'none',
  userSelect: 'none',
  opacity: '1 !important',
  top: '6px !important',
  left: '8px !important',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  maxWidth: '100%',
});
globalStyle(`${richEditor} .mention-pill`, {
  display: 'inline-block',
  backgroundColor: `color-mix(in srgb, ${vars.color.accent} 15%, transparent)`,
  color: vars.color.accent,
  borderRadius: vars.radius.sm,
  padding: '0 4px',
  fontSize: fontSize.em90,
  fontWeight: 600,
  userSelect: 'none',
  cursor: 'default',
});

globalStyle(`${richEditor} .mention-pill.room-mention-pill`, {
  backgroundColor: `color-mix(in srgb, ${vars.color.mention} 22%, transparent)`,
  color: vars.color.mention,
});

// The send button slides in from the right, where the other buttons leave to.
const sendPop = keyframes({
  from: { transform: 'translateX(40px)' },
  to: { transform: 'translateX(0)' },
});

export const sendBtn = style({
  animation: `${sendPop} 240ms cubic-bezier(0.2, 0.9, 0.3, 1) both`,
  '@media': { '(prefers-reduced-motion: reduce)': { animation: 'none' } },
  width: '28px',
  height: '28px',
  borderRadius: vars.radius.sm,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  backgroundColor: vars.color.accent,
  color: vars.color.onAccent,
  border: 'none',
  cursor: 'pointer',
  fontSize: fontSize.rem82,
  flexShrink: 0,
  transition: `background-color ${fast}, transform ${fast}`,
  ':hover': { backgroundColor: vars.color.accentHover },
  ':disabled': { opacity: 0.4, cursor: 'not-allowed', transform: 'none' },
});

// Plays while the button leaves (it is unmounted right after): back out to the right.
const sendOut = keyframes({
  from: { transform: 'translateX(0)' },
  to: { transform: 'translateX(40px)' },
});

export const sendBtnExit = style({
  animation: `${sendOut} 180ms ease-in both`,
  pointerEvents: 'none',
  '@media': { '(prefers-reduced-motion: reduce)': { animation: 'none' } },
});

// The sticker, GIF and more buttons leave while there is something to send, and return when it is
// cleared. They slide together along the row into the send button's place and back out of it, and
// the group's width follows, so the emoji button glides over instead of jumping.
const TOOL_SHIFT = '40px';

const toolIn = keyframes({
  from: { transform: `translateX(${TOOL_SHIFT})` },
  to: { transform: 'translateX(0)' },
});

const toolOut = keyframes({
  from: { transform: 'translateX(0)' },
  to: { transform: `translateX(${TOOL_SHIFT})` },
});

const toolsExpand = keyframes({
  from: { gridTemplateColumns: '0fr' },
  to: { gridTemplateColumns: '1fr' },
});

const toolsCollapse = keyframes({
  from: { gridTemplateColumns: '1fr' },
  to: { gridTemplateColumns: '0fr' },
});

export const TOOLS_EXIT_MS = 180;

export const toolsGroup = style({
  display: 'grid',
  gridTemplateColumns: '1fr',
  flexShrink: 0,
});

export const toolsGroupIn = style({
  animation: `${toolsExpand} 240ms cubic-bezier(0.2, 0.9, 0.3, 1) both`,
  '@media': { '(prefers-reduced-motion: reduce)': { animation: 'none' } },
});

export const toolsGroupOut = style({
  animation: `${toolsCollapse} ${TOOLS_EXIT_MS}ms ease-in both`,
  pointerEvents: 'none',
  '@media': { '(prefers-reduced-motion: reduce)': { animation: 'none' } },
});

// The buttons slide through the group's right edge while it opens and closes: it fades out there
// instead of cutting them off, and that fade is all the opacity change they need.
export const toolsRow = style({
  display: 'flex',
  alignItems: 'center',
  minWidth: 0,
});

const EDGE_FADE = 'linear-gradient(to right, #000 calc(100% - 28px), transparent)';

export const toolsRowClip = style({
  overflow: 'hidden',
  maskImage: EDGE_FADE,
  WebkitMaskImage: EDGE_FADE,
  maskRepeat: 'no-repeat',
  WebkitMaskRepeat: 'no-repeat',
  maskSize: '100% 100%',
  WebkitMaskSize: '100% 100%',
});

// The fade is a mask a little wider than the row, so growing the mask pushes the fade past the
// edge. It holds while the buttons slide in, then vanishes as they settle; on the way out it
// returns at once.
const MASK_FADED = { maskSize: '100% 100%', WebkitMaskSize: '100% 100%' };
const MASK_CLEAR = {
  maskSize: 'calc(100% + 28px) 100%',
  WebkitMaskSize: 'calc(100% + 28px) 100%',
};

const fadeVanish = keyframes({
  '0%': MASK_FADED,
  '55%': MASK_FADED,
  '100%': MASK_CLEAR,
});

const fadeReturn = keyframes({
  '0%': MASK_CLEAR,
  '35%': MASK_FADED,
  '100%': MASK_FADED,
});

export const toolsRowReveal = style({
  animation: `${fadeVanish} 240ms linear both`,
  '@media': { '(prefers-reduced-motion: reduce)': { animation: 'none' } },
});

export const toolsRowHide = style({
  animation: `${fadeReturn} ${TOOLS_EXIT_MS}ms ease-out both`,
  '@media': { '(prefers-reduced-motion: reduce)': { animation: 'none' } },
});

export const toolBtnPop = style({
  animation: `${toolIn} 240ms cubic-bezier(0.2, 0.9, 0.3, 1) both`,
  '@media': { '(prefers-reduced-motion: reduce)': { animation: 'none' } },
});

export const toolBtnExit = style({
  animation: `${toolOut} ${TOOLS_EXIT_MS}ms ease-in both`,
  pointerEvents: 'none',
  '@media': { '(prefers-reduced-motion: reduce)': { animation: 'none' } },
});

export const emojiBtn = style([attachBtn]);

export const emojiBtnActive = style([
  attachBtn,
  {
    color: vars.color.accent,
    ':hover': { backgroundColor: vars.color.bgHover, color: vars.color.accent },
  },
]);

export const moreBtn = style({
  width: '28px',
  height: '28px',
  borderRadius: vars.radius.sm,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
  border: 'none',
  background: 'none',
  color: vars.color.textMuted,
  fontSize: fontSize.rem95,
  flexShrink: 0,
  transition: `background-color ${fast}, color ${fast}`,
  ':hover': { backgroundColor: vars.color.bgHover, color: vars.color.textPrimary },
});

export const moreBtnActive = style([
  moreBtn,
  {
    color: vars.color.accent,
    ':hover': { backgroundColor: vars.color.bgHover, color: vars.color.accent },
  },
]);

export const linkPopover = style({
  position: 'absolute',
  bottom: TOOLBAR_ABOVE,
  left: 0,
  zIndex: zIndex.panel,
  display: 'flex',
  flexDirection: 'column',
  gap: '6px',
  padding: '10px 12px',
  backgroundColor: vars.color.bgPrimary,
  border: `1px solid ${vars.color.border}`,
  borderRadius: vars.radius.md,
  boxShadow: '0 8px 24px rgba(0,0,0,0.45)',
});

export const linkLabel = style({
  fontSize: fontSize.rem72,
  fontWeight: 600,
  color: vars.color.textMuted,
  textTransform: 'uppercase',
  letterSpacing: '0.02em',
});

export const linkInput = style({
  width: '240px',
  padding: '6px 8px',
  backgroundColor: vars.color.bgInput,
  color: vars.color.textPrimary,
  border: `1px solid ${vars.color.border}`,
  borderRadius: vars.radius.sm,
  outline: 'none',
  fontSize: fontSize.rem90,
  fontFamily: 'inherit',
  transition: `border-color ${fast}, box-shadow ${fast}`,
  ':focus': {
    borderColor: vars.color.accent,
    boxShadow: `0 0 0 2px color-mix(in srgb, ${vars.color.accent} 18%, transparent)`,
  },
  '::placeholder': { color: vars.color.textMuted },
});

export const linkActions = style({
  display: 'flex',
  justifyContent: 'flex-end',
  gap: '6px',
});

const linkBtnBase = style({
  padding: '5px 14px',
  borderRadius: vars.radius.sm,
  border: 'none',
  cursor: 'pointer',
  fontSize: fontSize.rem82,
  fontWeight: 600,
  transition: `background-color ${fast}, color ${fast}`,
});

export const linkApply = style([
  linkBtnBase,
  {
    backgroundColor: vars.color.accent,
    color: vars.color.onAccent,
    ':hover': { backgroundColor: vars.color.accentHover },
    ':disabled': { opacity: 0.4, cursor: 'not-allowed' },
  },
]);

export const linkCancel = style([
  linkBtnBase,
  {
    backgroundColor: 'transparent',
    color: vars.color.textMuted,
    ':hover': { backgroundColor: vars.color.bgHover, color: vars.color.textPrimary },
  },
]);

export const identityStrip = style([statusStrip, { alignItems: 'center', gap: '10px' }]);

export const identityIcon = style({
  flexShrink: 0,
  color: vars.color.warning,
});

export const identityText = style({
  flex: 1,
  minWidth: 0,
  color: vars.color.textPrimary,
  overflowWrap: 'anywhere',
});
