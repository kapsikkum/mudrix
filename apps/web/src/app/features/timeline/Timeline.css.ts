import { style, keyframes, globalStyle } from '@vanilla-extract/css';
import { vars } from '@/theme/vars.css';
import { CHAT_SCALE_VAR, chatSize, chatSpace } from './chatDisplay';
import { TOUCH_FIRST_QUERY } from '@/theme/uiDensity';
import { fontSize } from '@/theme/typeScale';
import { fast, fadeInUp, scaleIn } from '@/theme/animations.css';
import { TYPING_INDICATOR_BAND_HEIGHT } from './composer/TypingIndicator.css';

export const timelineContainer = style({
  flex: 1,
  backgroundColor: vars.color.bgSecondary,
  overflowY: 'auto',
  overflowX: 'hidden',
  overflowAnchor: 'none',
});

export const timelineBody = style({
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'flex-end',
  minHeight: '100%',
  padding: `8px 0 ${TYPING_INDICATOR_BAND_HEIGHT}px`,
});

export const timelineIntro = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '12px',
  padding: '40px 16px 32px',
  flexShrink: 0,
});

export const timelinePlaceholder = style({
  display: 'flex',
  flexDirection: 'column',
  flexShrink: 0,
});

const pulse = keyframes({
  '0%': { opacity: 0.6 },
  '50%': { opacity: 1 },
  '100%': { opacity: 0.6 },
});

export const predecessorNotice = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '8px',
  padding: '12px 16px',
  fontSize: chatSize(0.82),
  color: vars.color.textMuted,
  textAlign: 'center',
  flexShrink: 0,
  borderBottom: `1px solid ${vars.color.border}`,
});

export const predecessorNoticeBtn = style({
  background: 'none',
  border: 'none',
  color: vars.color.accent,
  cursor: 'pointer',
  fontSize: chatSize(0.82),
  fontWeight: 600,
  fontFamily: 'inherit',
  padding: 0,
  textDecoration: 'underline',
  whiteSpace: 'nowrap',
});

export const timelineStart = style({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: '6px',
  padding: '24px 16px 8px',
  color: vars.color.textMuted,
  fontSize: chatSize(0.82),
  textAlign: 'center',
  flexShrink: 0,
  userSelect: 'none',
});

export const timelineStartIcon = style({
  width: '40px',
  height: '40px',
  borderRadius: '50%',
  backgroundColor: vars.color.bgTertiary,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  marginBottom: '4px',
  color: vars.color.textMuted,
});

export const timelineStartTitle = style({
  fontWeight: 600,
  fontSize: chatSize(0.88),
  color: vars.color.textSecondary,
});

const spin = keyframes({ to: { transform: 'rotate(360deg)' } });
export const spinner = style({
  width: '24px',
  height: '24px',
  border: `2px solid ${vars.color.border}`,
  borderTopColor: vars.color.accent,
  borderRadius: '50%',
  animationName: spin,
  animationDuration: '0.8s',
  animationTimingFunction: 'linear',
  animationIterationCount: 'infinite',
});

export const dateSeparator = style({
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
  padding: '12px 16px 4px',
  fontSize: chatSize(0.78),
  color: vars.color.textMuted,
  fontWeight: 600,
  letterSpacing: '0.04em',
  '::before': { content: '""', flex: 1, height: '1px', backgroundColor: vars.color.border },
  '::after': { content: '""', flex: 1, height: '1px', backgroundColor: vars.color.border },
});

export const msgAvatarCol = style({
  flexShrink: 0,
  width: '36px',
  display: 'flex',
  justifyContent: 'center',
  paddingTop: '2px',
});

// The message and its shield side by side. A plain block-level flex row would span the whole
// column and flex:1 on the body would push the shield to the pane's right edge. fit-content
// shrinks the row to its content (capped at the column width so long text still wraps), keeping
// the shield snug. 'last baseline' sits the shield on the last line of wrapped text ('center'
// fallback).
export const msgContentShieldRow = style({
  display: 'flex',
  alignItems: ['center', 'last baseline'],
  gap: '6px',
  width: 'fit-content',
  maxWidth: '100%',
});

export const msgContentShieldBody = style({
  flex: 1,
  minWidth: 0,
});

export const msgRow = style({
  display: 'flex',
  alignItems: 'flex-start',
  gap: '12px',
  padding: `${chatSpace(6)} 16px ${chatSpace(2)}`,
  position: 'relative',
  containerType: 'inline-size',
});

export const msgRowGrouped = style([
  msgRow,
  { paddingTop: chatSpace(1), paddingBottom: chatSpace(1) },
]);

export const msgRowActive = style({
  zIndex: 1,
});

// Hover highlight region wrapping avatar + message body; the read-receipts column sits to its right
// so the highlight stops at the box edge. Highlighting also triggers from a row hover (e.g. moving
// the pointer over the receipts column) so the toolbar and the highlight stay in sync.
export const msgHoverRegion = style({
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'flex-start',
  gap: '12px',
  rowGap: 0,
  flex: 1,
  minWidth: 0,
  position: 'relative',
  borderRadius: '12px',
  selectors: {
    '&:hover': { backgroundColor: vars.color.bgHover },
    [`${msgRow}:hover &`]: { backgroundColor: vars.color.bgHover },
    [`${msgRowGrouped}:hover &`]: { backgroundColor: vars.color.bgHover },
  },
});

// Discord-style reply line (modern layout): the quoted message sits on its own line above the
// avatar row, joined to the avatar by an L-shaped connector. A reply is never grouped, so every
// reply has an avatar row to join.
export const replyLineRow = style({
  position: 'relative',
  display: 'flex',
  alignItems: 'center',
  flex: '0 0 100%',
  minWidth: 0,
  // The avatar column is 36px wide: the connector starts at its centre.
  paddingLeft: '54px',
  marginBottom: '2px',
  minHeight: '22px',
});

export const replyConnector = style({
  position: 'absolute',
  left: '18px',
  top: '50%',
  width: '30px',
  height: '60%',
  boxSizing: 'border-box',
  borderLeft: `2px solid ${vars.color.border}`,
  borderTop: `2px solid ${vars.color.border}`,
  borderTopLeftRadius: '8px',
  pointerEvents: 'none',
});

export const replyLineSkeleton = style({
  width: '45%',
  maxWidth: '240px',
  height: '0.7rem',
  borderRadius: '6px',
  backgroundColor: vars.color.bgTertiary,
  animation: `${pulse} 1.5s ease-in-out infinite`,
});

export const replyLineButton = style({
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
  minWidth: 0,
  maxWidth: '100%',
  textAlign: 'left',
  background: 'none',
  border: 'none',
  padding: 0,
  font: 'inherit',
  fontSize: chatSize(0.85),
  color: vars.color.textMuted,
  cursor: 'pointer',
  overflow: 'hidden',
  whiteSpace: 'nowrap',
  textOverflow: 'ellipsis',
  ':hover': { color: vars.color.textPrimary },
});

// The button that folds an expanded run of unreadable messages back up.
export const undecryptableCollapseRow = style({
  padding: '4px 16px 0',
});

// Sender name + timestamp row (sits above the first message content)
export const msgMeta = style({
  display: 'flex',
  alignItems: 'baseline',
  gap: '8px',
  marginBottom: '2px',
  flexWrap: 'wrap',
});
export const msgSender = style({
  fontWeight: 600,
  color: vars.color.accent,
  fontSize: chatSize(0.9),
  cursor: 'pointer',
  border: 'none',
  background: 'none',
  padding: 0,
  font: 'inherit',
  ':hover': { textDecoration: 'underline' },
});
export const msgTime = style({
  color: vars.color.textMuted,
  fontSize: chatSize(0.72),
  opacity: 0,
  transition: `opacity ${fast}`,
  selectors: {
    [`${msgRow}:hover &`]: { opacity: 1 },
    [`${msgRowGrouped}:hover &`]: { opacity: 1 },
  },
});

export const msgBody = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '1px',
  flex: 1,
  minWidth: 0,
  paddingRight: '12px',
});

export const msgContent = style({
  backgroundColor: 'transparent',
  color: vars.color.textPrimary,
  fontSize: chatSize(0.95),
  lineHeight: '1.55',
  wordBreak: 'break-word',
  position: 'relative',
  display: 'inline',
});

// Grouped follow-up: content only, already indented by avatar spacer
export const msgContentGrouped = style([
  msgContent,
  {
    display: 'inline-flex',
    alignItems: 'flex-end',
    flexWrap: 'wrap',
    gap: '0 6px',
    maxWidth: '100%',
  },
]);

// Classic variant: same baseline structure, message content rendered inside bubbles.
// Bubble layout (Signal-style): incoming bubbles are a light tint of the theme accent on the
// theme's raised surface, outgoing ones a deepened accent with white text and sit on the right.
const BUBBLE_OTHER_BG = `color-mix(in srgb, ${vars.color.accent} 14%, ${vars.color.bgTertiary})`;
const BUBBLE_OWN_BG = `color-mix(in srgb, ${vars.color.accent} 78%, #000)`;
const msgBubbleBase = {
  backgroundColor: BUBBLE_OTHER_BG,
  padding: '8px 14px',
  borderRadius: '18px',
  maxWidth: 'min(78%, 620px)',
};

export const msgContentClassic = style([
  msgContent,
  msgBubbleBase,
  { display: 'inline-block', alignSelf: 'flex-start' },
]);

const ownBubble = {
  backgroundColor: BUBBLE_OWN_BG,
  color: vars.color.onAccent,
  alignSelf: 'flex-end',
};

export const msgContentClassicOwn = style([msgContentClassic, ownBubble]);

// Grouped bubbles stack their content and the time (right-aligned underneath) instead of wrapping
// in a row, so the time never lands beside an image or on a different side from bubble to bubble.
export const msgContentClassicGrouped = style([
  msgContentGrouped,
  msgBubbleBase,
  { alignSelf: 'flex-start', flexDirection: 'column', alignItems: 'stretch', gap: '2px' },
]);

export const msgContentClassicGroupedOwn = style([msgContentClassicGrouped, ownBubble]);

// Marks the current user's rows; only styled in the Bubble layout (root attribute).
export const msgRowOwn = style({});

// Stands in for a picture that is still decoding: a pulse, which runs on the compositor.
export const imageSkeleton = style({
  position: 'absolute',
  inset: 0,
  width: '100%',
  height: '100%',
  backgroundColor: vars.color.bgTertiary,
  animation: `${pulse} 1.4s ease-in-out infinite`,
  pointerEvents: 'none',
});

// A picture that could not be loaded (a broken link, a server error).
export const imageErrorFallback = style({
  position: 'absolute',
  inset: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  backgroundColor: vars.color.bgTertiary,
  color: vars.color.textMuted,
  width: '100%',
});

export const mediaBox = style({
  position: 'relative',
  overflow: 'hidden',
  width: '100%',
  maxWidth: '320px',
  borderRadius: vars.radius.sm,
  backgroundColor: vars.color.border,
  selectors: {
    [`${msgContentClassic} &, ${msgContentClassicOwn} &, ${msgContentClassicGrouped} &, ${msgContentClassicGroupedOwn} &`]:
      {
        width: '320px',
      },
  },
});

export const stickerBox = style({
  position: 'relative',
  overflow: 'hidden',
  width: '152px',
  borderRadius: vars.radius.sm,
});

export const mediaBoxPulse = style({
  position: 'absolute',
  inset: 0,
  animation: `${pulse} 1.5s ease-in-out infinite`,
  selectors: {
    [`${stickerBox} &`]: {
      backgroundColor: vars.color.border,
    },
  },
});

export const stickerPulseGlyph = style({
  position: 'absolute',
  top: '50%',
  left: '50%',
  transform: 'translate(-50%, -50%)',
  color: vars.color.textMuted,
});

export const mediaBoxFillWrap = style({
  position: 'absolute',
  inset: 0,
  display: 'block',
  width: '100%',
  height: '100%',
  overflow: 'hidden',
});

export const mediaFill = style({
  width: '100%',
  height: '100%',
  objectFit: 'contain',
  display: 'block',
});

export const mediaClickable = style({
  cursor: 'pointer',
  border: 'none',
  padding: 0,
  background: 'none',
  textAlign: 'initial',
});

export const videoExpandBtn = style({
  position: 'absolute',
  top: '8px',
  right: '8px',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '30px',
  height: '30px',
  borderRadius: vars.radius.sm,
  border: 'none',
  backgroundColor: 'rgba(0,0,0,0.5)',
  color: '#fff',
  cursor: 'pointer',
  zIndex: 1,
  transition: `background-color ${fast}`,
  ':hover': {
    backgroundColor: 'rgba(0,0,0,0.75)',
  },
  ':focus-visible': {
    outline: `2px solid ${vars.color.accent}`,
  },
});

// A large video that waits for a click: poster (or the pulse) behind a play button and size/duration chips.
export const videoPlayOverlay = style({
  position: 'absolute',
  inset: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '100%',
  height: '100%',
  padding: 0,
  border: 'none',
  background: 'none',
  cursor: 'pointer',
  zIndex: 1,
  ':focus-visible': {
    outline: `2px solid ${vars.color.accent}`,
    outlineOffset: '-2px',
  },
});

export const videoPlayCircle = style({
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '52px',
  height: '52px',
  borderRadius: '999px',
  backgroundColor: 'rgba(0,0,0,0.6)',
  color: '#fff',
  transition: `background-color ${fast}, transform ${fast}`,
  selectors: {
    [`${videoPlayOverlay}:hover &`]: {
      backgroundColor: vars.color.accent,
      transform: 'scale(1.06)',
    },
  },
});

export const videoMetaChip = style({
  position: 'absolute',
  left: '8px',
  bottom: '8px',
  padding: '2px 8px',
  borderRadius: '999px',
  backgroundColor: 'rgba(0,0,0,0.6)',
  color: '#fff',
  fontSize: chatSize(0.8),
  lineHeight: '1.5',
  pointerEvents: 'none',
});

export const videoProgressPanel = style({
  position: 'absolute',
  left: '8px',
  right: '8px',
  bottom: '8px',
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  padding: '6px 8px',
  borderRadius: vars.radius.sm,
  backgroundColor: 'rgba(0,0,0,0.6)',
  color: '#fff',
  fontSize: chatSize(0.8),
  zIndex: 1,
});

export const videoProgressTrack = style({
  flex: 1,
  height: '4px',
  borderRadius: '999px',
  backgroundColor: 'rgba(255,255,255,0.25)',
  overflow: 'hidden',
});

// No size to measure against (or nothing received yet): the bar just pulses.
export const videoProgressFill = style({
  width: '100%',
  height: '100%',
  borderRadius: '999px',
  backgroundColor: vars.color.accent,
  animation: `${pulse} 1.5s ease-in-out infinite`,
});

// Width is set inline from the received bytes.
export const videoProgressFillMeasured = style({
  height: '100%',
  borderRadius: '999px',
  backgroundColor: vars.color.accent,
  transition: `width ${fast}`,
});

export const videoMetaText = style({
  flexShrink: 0,
  fontVariantNumeric: 'tabular-nums',
});

export const videoCancelBtn = style({
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
  width: '22px',
  height: '22px',
  padding: 0,
  borderRadius: vars.radius.sm,
  border: 'none',
  backgroundColor: 'transparent',
  color: 'inherit',
  cursor: 'pointer',
  transition: `background-color ${fast}`,
  ':hover': { backgroundColor: 'rgba(255,255,255,0.2)' },
  ':focus-visible': { outline: `2px solid ${vars.color.accent}` },
});

export const filePreviewFrame = style({
  width: '100%',
  height: '70vh',
  border: 'none',
  borderRadius: vars.radius.sm,
  backgroundColor: vars.color.bgPrimary,
});

export const filePreviewText = style({
  margin: 0,
  maxHeight: '70vh',
  overflow: 'auto',
  whiteSpace: 'pre-wrap',
  overflowWrap: 'anywhere',
  fontFamily: 'monospace',
  fontSize: '0.85rem',
  color: vars.color.textPrimary,
});

/** Wrapper for a text file card plus caption: spans the whole chat column. */
export const textFileWrap = style({ display: 'block', width: '100%' });

export const textFileCard = style({
  display: 'flex',
  flexDirection: 'column',
  width: '100%',
  borderRadius: vars.radius.md,
  border: `1px solid ${vars.color.border}`,
  backgroundColor: vars.color.bgSecondary,
  overflow: 'hidden',
});

export const textFileBody = style({
  margin: 0,
  padding: '10px 14px',
  maxHeight: '190px',
  overflow: 'auto',
  fontFamily: 'monospace',
  fontSize: '0.8rem',
  lineHeight: 1.45,
  whiteSpace: 'pre-wrap',
  overflowWrap: 'anywhere',
  color: vars.color.textPrimary,
  backgroundColor: vars.color.bgPrimary,
});

export const textFileFooter = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '12px',
  padding: '10px 14px',
  borderTop: `1px solid ${vars.color.border}`,
});

export const textFileInfo = style({
  display: 'flex',
  flexDirection: 'column',
  minWidth: 0,
});

export const textFileName = style({
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  fontSize: '0.9rem',
  fontWeight: 500,
  color: vars.color.textPrimary,
});

export const textFileSize = style({ fontSize: '0.75rem', color: vars.color.textMuted });

export const textFileActions = style({
  display: 'flex',
  alignItems: 'center',
  gap: '2px',
  flexShrink: 0,
});

export const textFileAction = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '30px',
  height: '30px',
  border: 'none',
  background: 'none',
  borderRadius: vars.radius.sm,
  cursor: 'pointer',
  color: vars.color.textMuted,
  ':hover': { backgroundColor: vars.color.bgHover, color: vars.color.textPrimary },
});

export const msgAudioSkeleton = style({
  width: '280px',
  height: '56px',
  borderRadius: vars.radius.sm,
  backgroundColor: vars.color.border,
  animation: `${pulse} 1.5s ease-in-out infinite`,
});

export const mediaWrap = style({
  display: 'block',
  width: '100%',
});

export const mediaCaption = style({
  display: 'block',
  color: vars.color.textPrimary,
  fontSize: chatSize(0.9),
  lineHeight: '1.5',
  wordBreak: 'break-word',
  marginTop: '4px',
});

export const mediaError = style({
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px',
  maxWidth: '320px',
  padding: '4px 0',
  fontSize: chatSize(0.85),
  color: vars.color.textMuted,
});

export const mediaSpoilerOverlay = style({
  position: 'absolute',
  inset: 0,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '8px',
  width: '100%',
  height: '100%',
  border: 'none',
  padding: '12px',
  cursor: 'pointer',
  backgroundColor: 'rgba(0, 0, 0, 0.55)',
  backdropFilter: 'blur(6px)',
  WebkitBackdropFilter: 'blur(6px)',
  transition: 'background-color 0.2s ease',
  ':hover': {
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
  },
  ':focus-visible': {
    outline: `2px solid ${vars.color.accent}`,
    outlineOffset: '2px',
  },
});

export const mediaSpoilerChip = style({
  display: 'inline-flex',
  alignItems: 'center',
  padding: '2px 10px',
  borderRadius: '999px',
  lineHeight: '20px',
  fontSize: chatSize(0.72),
  fontWeight: 600,
  letterSpacing: '0.5px',
  textTransform: 'uppercase',
  color: '#fff',
  backgroundColor: 'rgba(0, 0, 0, 0.45)',
  userSelect: 'none',
});

export const mediaSpoilerReason = style({
  maxWidth: '100%',
  fontSize: chatSize(0.78),
  lineHeight: '1.4',
  color: 'rgba(255, 255, 255, 0.85)',
  textAlign: 'center',
  wordBreak: 'break-word',
});

export const animatedImageFill = style({
  position: 'relative',
  display: 'block',
  width: '100%',
  height: '100%',
});

export const animatedImageBadge = style({
  position: 'absolute',
  top: '6px',
  left: '6px',
  zIndex: 1,
  padding: '0 6px',
  lineHeight: '18px',
  fontSize: '10px',
  fontWeight: 700,
  letterSpacing: '0.5px',
  color: '#fff',
  backgroundColor: 'rgba(0, 0, 0, 0.6)',
  borderRadius: '6px',
  pointerEvents: 'none',
  userSelect: 'none',
});

export const gallery = style({
  display: 'grid',
  gap: '4px',
  maxWidth: '400px',
  width: '100%',
  borderRadius: '12px',
  padding: '2px',
  selectors: {
    [`${msgContentClassic} &, ${msgContentClassicOwn} &, ${msgContentClassicGrouped} &, ${msgContentClassicGroupedOwn} &`]:
      {
        width: '400px',
      },
  },
});

export const galleryTile = style({
  position: 'relative',
  overflow: 'hidden',
  border: 'none',
  padding: 0,
  margin: 0,
  display: 'block',
  minHeight: 0,
  minWidth: 0,
  width: '100%',
  borderRadius: '8px',
  backgroundColor: vars.color.border,
  cursor: 'zoom-in',
  ':hover': {
    filter: 'brightness(1.08)',
  },
});

export const galleryTileImg = style({
  width: '100%',
  height: '100%',
  objectFit: 'cover',
  display: 'block',
  userSelect: 'none',
});

export const galleryTileSkeleton = style({
  width: '100%',
  height: '100%',
  minHeight: '48px',
  backgroundColor: vars.color.border,
  animation: `${pulse} 1.5s ease-in-out infinite`,
});

export const galleryMore = style([
  galleryTile,
  {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#fff',
    fontSize: chatSize(1.1),
    fontWeight: 600,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    cursor: 'zoom-in',
    ':hover': {
      backgroundColor: 'rgba(0, 0, 0, 0.7)',
    },
  },
]);

export const fileCard = style({
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
  width: '100%',
  maxWidth: '320px',
  padding: '8px 10px',
  borderRadius: vars.radius.md,
  border: `1px solid ${vars.color.border}`,
  backgroundColor: vars.color.bgSecondary,
  selectors: {
    [`${msgContentClassic} &, ${msgContentClassicOwn} &, ${msgContentClassicGrouped} &, ${msgContentClassicGroupedOwn} &`]:
      { width: '320px' },
  },
});

export const fileIcon = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '36px',
  height: '36px',
  flexShrink: 0,
  borderRadius: vars.radius.sm,
  backgroundColor: vars.color.bgTertiary,
  color: vars.color.accent,
});

export const fileInfo = style({
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'center',
  gap: '2px',
  flex: 1,
  minWidth: 0,
});

export const fileName = style({
  fontSize: chatSize(0.9),
  fontWeight: 500,
  color: vars.color.textPrimary,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});

export const fileSize = style({
  fontSize: chatSize(0.78),
  color: vars.color.textMuted,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});

export const fileDownload = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '28px',
  height: '28px',
  flexShrink: 0,
  borderRadius: vars.radius.sm,
  color: vars.color.textMuted,
  transition: `background-color ${fast}, color ${fast}`,
  ':hover': {
    backgroundColor: vars.color.bgHover,
    color: vars.color.textPrimary,
  },
});

globalStyle(`${fileCard} a, ${fileCard} a:hover`, {
  textDecoration: 'none',
});

export const fileSkeleton = style([
  fileCard,
  {
    color: vars.color.accent,
    opacity: 0.5,
    animation: `${pulse} 1.5s ease-in-out infinite`,
  },
]);

export const loadingText = style({
  opacity: 0.5,
  fontSize: chatSize(0.8),
});

export const emoteMsg = style({
  color: 'inherit',
  opacity: 0.85,
});

export const actionsVisible = style({
  display: 'flex',
});

const editedMarkerBase = {
  fontSize: chatSize(0.72),
  color: vars.color.textMuted,
  fontStyle: 'italic',
  whiteSpace: 'nowrap',
  // Rendered as a button that opens the edit history.
  background: 'none',
  border: 'none',
  padding: 0,
  fontFamily: 'inherit',
  cursor: 'pointer',
};

// Inline next to the sender name, revealed on row hover
export const editedMarkerHeader = style([
  editedMarkerBase,
  {
    opacity: 0,
    transition: `opacity ${fast}`,
    selectors: {
      [`${msgRow}:hover &`]: { opacity: 1 },
      [`${msgRowGrouped}:hover &`]: { opacity: 1 },
    },
  },
]);

// Sits inside grouped content next to the message text, revealed on row hover
export const editedMarkerGrouped = style([
  editedMarkerBase,
  {
    lineHeight: '1.375',
    alignSelf: 'flex-end',
    flexShrink: 0,
    opacity: 0,
    transition: `opacity ${fast}`,
    selectors: {
      [`${msgRow}:hover &`]: { opacity: 1 },
      [`${msgRowGrouped}:hover &`]: { opacity: 1 },
    },
  },
]);

// Same spot but always visible (classic variant)
export const editedMarkerGroupedClassic = style([
  editedMarkerBase,
  {
    lineHeight: '1.375',
    alignSelf: 'flex-end',
    flexShrink: 0,
  },
]);

export const redactedMsg = style({
  display: 'inline-flex',
  alignItems: 'center',
  gap: '4px',
  fontStyle: 'italic',
  color: vars.color.textMuted,
  fontSize: chatSize(0.85),
});

export const noticeMsg = style({
  color: vars.color.textMuted,
  fontSize: chatSize(0.85),
});

const markdownContentClasses = [
  msgContent,
  msgContentGrouped,
  msgContentClassic,
  msgContentClassicOwn,
  msgContentClassicGrouped,
  msgContentClassicGroupedOwn,
  emoteMsg,
  noticeMsg,
];

const scopedContentSelectors = (children: string): string =>
  children
    .split(',')
    .map((child) => child.trim())
    .flatMap((child) => markdownContentClasses.map((c) => `${c} ${child}`))
    .join(', ');

globalStyle(scopedContentSelectors('ol, ul'), {
  margin: '6px 0',
  paddingLeft: '1.6em',
  listStylePosition: 'outside',
});
globalStyle(scopedContentSelectors('ol'), {
  listStyleType: 'decimal',
});
globalStyle(scopedContentSelectors('ul'), {
  listStyleType: 'disc',
});
globalStyle(scopedContentSelectors('li'), {
  margin: '2px 0',
});
globalStyle(scopedContentSelectors('ol ol, ul ul, ol ul, ul ol'), {
  marginTop: '2px',
  marginBottom: '2px',
});

globalStyle(scopedContentSelectors('h1'), {
  fontSize: '1.4em',
  fontWeight: 600,
  lineHeight: 1.3,
  margin: '8px 0 4px',
});
globalStyle(scopedContentSelectors('h2'), {
  fontSize: '1.28em',
  fontWeight: 600,
  lineHeight: 1.3,
  margin: '8px 0 4px',
});
globalStyle(scopedContentSelectors('h3'), {
  fontSize: '1.16em',
  fontWeight: 600,
  lineHeight: 1.3,
  margin: '8px 0 4px',
});
globalStyle(scopedContentSelectors('h4'), {
  fontSize: '1.06em',
  fontWeight: 600,
  lineHeight: 1.3,
  margin: '8px 0 4px',
});
globalStyle(scopedContentSelectors('h5'), {
  fontSize: '0.98em',
  fontWeight: 600,
  lineHeight: 1.3,
  margin: '8px 0 4px',
});
globalStyle(scopedContentSelectors('h6'), {
  fontSize: '0.9em',
  fontWeight: 600,
  lineHeight: 1.3,
  margin: '8px 0 4px',
  color: vars.color.textMuted,
});
globalStyle(
  scopedContentSelectors(
    'h1:first-child, h2:first-child, h3:first-child, h4:first-child, h5:first-child, h6:first-child'
  ),
  {
    marginTop: 0,
  }
);

globalStyle(scopedContentSelectors('hr'), {
  border: 'none',
  borderTop: `1px solid ${vars.color.border}`,
  margin: '10px 0',
});

globalStyle(scopedContentSelectors('table'), {
  borderCollapse: 'collapse',
  margin: '8px 0',
  maxWidth: '100%',
  display: 'block',
  overflowX: 'auto',
});
globalStyle(scopedContentSelectors('th, td'), {
  border: `1px solid ${vars.color.border}`,
  padding: '4px 8px',
  textAlign: 'left',
});
globalStyle(scopedContentSelectors('th'), {
  backgroundColor: vars.color.bgTertiary,
  fontWeight: 600,
});
globalStyle(scopedContentSelectors('caption'), {
  fontSize: '0.85em',
  color: vars.color.textMuted,
  padding: '4px 0',
  textAlign: 'left',
});

globalStyle(scopedContentSelectors('details'), {
  margin: '6px 0',
});
globalStyle(scopedContentSelectors('summary'), {
  cursor: 'pointer',
  fontWeight: 500,
});

export const locationMsg = style({
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px',
  color: vars.color.textSecondary,
});

export const locationLink = style({
  color: vars.color.accent,
  textDecoration: 'none',
  fontWeight: 500,
  selectors: {
    '&:hover': { textDecoration: 'underline' },
  },
});

export const emojiOnly = style({
  fontSize: `calc(var(--mudrix-emoji-only-size, 2.5rem) * var(${CHAT_SCALE_VAR}, 1))`,
  lineHeight: 1.2,
});

export const replyQuote = style({
  display: 'block',
  width: '100%',
  textAlign: 'left',
  background: 'none',
  border: 'none',
  padding: 0,
  font: 'inherit',
  color: vars.color.textMuted,
  borderLeft: `3px solid ${vars.color.accent}`,
  paddingLeft: '8px',
  marginBottom: '4px',
  fontSize: chatSize(0.95),
  borderRadius: '2px',
  cursor: 'pointer',
  // One line with an ellipsis, like Discord, whatever the quoted message looks like.
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  ':hover': {
    color: vars.color.textPrimary,
  },
});

// The quoted text arrives as rendered HTML (paragraphs, line breaks, lists). Flatten it to a single
// inline run so it can be cut off with an ellipsis.
export const replyText = style({
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});
globalStyle(`${replyText} *`, {
  display: 'inline',
  whiteSpace: 'nowrap',
  margin: 0,
  padding: 0,
});
globalStyle(`${replyText} br`, { display: 'none' });

// A reply quote's image thumbnail, sized to the line of text it sits in.
export const replyImage = style({
  height: '1.4em',
  width: 'auto',
  verticalAlign: 'middle',
  display: 'inline',
});

export const replyMediaRow = style({
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px',
  maxWidth: '100%',
  verticalAlign: 'middle',
});

export const replyMediaThumb = style({
  width: '36px',
  height: '36px',
  objectFit: 'cover',
  borderRadius: '4px',
  flexShrink: 0,
  verticalAlign: 'middle',
});

export const replyMediaThumbWrap = style({
  position: 'relative',
  display: 'inline-flex',
  width: '36px',
  height: '36px',
  flexShrink: 0,
  verticalAlign: 'middle',
});

export const replyMediaIcon = style({
  width: '36px',
  height: '36px',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: '4px',
  backgroundColor: vars.color.bgTertiary,
  border: `1px solid ${vars.color.border}`,
  color: vars.color.accent,
  flexShrink: 0,
});

export const replyMediaText = style({
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});

export const replyMediaCover = style({
  display: 'inline-flex',
  alignItems: 'center',
  gap: '4px',
  height: '20px',
  padding: '0 8px',
  borderRadius: '10px',
  backgroundColor: vars.color.bgTertiary,
  border: `1px solid ${vars.color.border}`,
  color: vars.color.textSecondary,
  fontSize: chatSize(0.75),
  fontWeight: 600,
  letterSpacing: '0.4px',
  textTransform: 'uppercase',
  flexShrink: 0,
  verticalAlign: 'middle',
});

export const reactionsBar = style({
  display: 'flex',
  flexWrap: 'wrap',
  gap: '4px',
  marginTop: '4px',
});

export const reactionChip = style({
  display: 'inline-flex',
  alignItems: 'center',
  gap: '4px',
  backgroundColor: vars.color.bgTertiary,
  border: `1px solid ${vars.color.border}`,
  borderRadius: '12px',
  padding: '2px 8px',
  fontSize: chatSize(0.95),
  cursor: 'pointer',
  userSelect: 'none',
  fontFamily: 'inherit',
  color: vars.color.textPrimary,
  transition: `opacity ${fast}, border-color ${fast}, background-color ${fast}`,
  ':hover': { borderColor: vars.color.accent, backgroundColor: vars.color.bgHover },
  animationName: scaleIn,
  animationDuration: '120ms',
  animationTimingFunction: 'ease-out',
  selectors: {
    '[data-hovered="false"] &': { opacity: 0.8 },
    '[data-hovered="true"] &': { opacity: 1 },
  },
});

export const reactionChipOwn = style([
  reactionChip,
  {
    borderColor: vars.color.accent,
    backgroundColor: vars.color.bgActive,
    ':hover': { backgroundColor: vars.color.bgActive, borderColor: vars.color.accentHover },
  },
]);

export const reactionImg = style({
  width: '1.1rem',
  height: '1.1rem',
  verticalAlign: 'middle',
  objectFit: 'contain',
});

const EMOJI_GLYPH_URI =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 256 256'%3E%3Cpath fill='%238e8ea8' d='M174.92,156c-10.29,17.79-27.39,28-46.92,28s-36.63-10.2-46.93-28a8,8,0,1,1,13.86-8c7.46,12.91,19.2,20,33.07,20s25.61-7.1,33.08-20a8,8,0,1,1,13.84,8ZM232,128a104.35,104.35,0,0,1-4.56,30.56,8,8,0,0,1-2,3.31l-63.57,63.57a7.9,7.9,0,0,1-3.3,2A104,104,0,1,1,232,128Zm-16,0a87.89,87.89,0,1,0-64,84.69L212.69,152A88.05,88.05,0,0,0,216,128ZM92,120a12,12,0,1,0-12-12A12,12,0,0,0,92,120Zm72-24a12,12,0,1,0,12,12A12,12,0,0,0,164,96Z'/%3E%3C/svg%3E";

const inlineEmojiPlaceholder = {
  aspectRatio: '1 / 1',
  borderRadius: '3px',
  backgroundColor: vars.color.border,
  backgroundImage: `url("${EMOJI_GLYPH_URI}")`,
  backgroundRepeat: 'no-repeat',
  backgroundPosition: 'center',
  backgroundSize: '65% 65%',
  animation: `${pulse} 1.5s ease-in-out infinite`,
  color: 'transparent',
};

export const inlinePackEmoji = style({
  display: 'inline-block',
  width: 'auto',
  height: '1em',
  verticalAlign: 'middle',
  objectFit: 'contain',
  margin: '0 1px',
  selectors: {
    '&:not([data-media-loaded])': inlineEmojiPlaceholder,
  },
});

globalStyle('img[data-mx-emoticon]', {
  display: 'inline-block',
  width: 'auto',
  height: '1em',
  verticalAlign: 'middle',
  objectFit: 'contain',
  margin: '0 1px',
});

globalStyle('img[data-mx-emoticon]:not([data-media-loaded])', inlineEmojiPlaceholder);

export const reactionQuickAdd = style([
  reactionChip,
  {
    padding: '2px 8px',
    color: vars.color.textMuted,
    opacity: 0,
    transition: `opacity ${fast}, border-color ${fast}, background-color ${fast}`,
    selectors: {
      '[data-hovered="false"] &': { opacity: 0 },
      '[data-hovered="true"] &': { opacity: 1 },
    },
    '@media': {
      '(pointer: coarse)': {
        opacity: 1,
      },
    },
  },
]);

export const reactionQuickAddIconWrap = style({
  position: 'relative',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
});

export const reactionQuickAddPlus = style({
  position: 'absolute',
  top: '-5px',
  right: '-5px',
  fontSize: chatSize(0.55),
  fontWeight: 800,
  lineHeight: 1,
  color: 'inherit',
  backgroundColor: vars.color.bgSecondary,
  borderRadius: '50%',
  width: '8px',
  height: '8px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
});

export const msgActions = style({
  position: 'absolute',
  right: '48px',
  top: '-30px',
  gap: '3px',
  backgroundColor: vars.color.bgSecondary,
  border: `1px solid ${vars.color.border}`,
  borderRadius: vars.radius.sm,
  padding: '3px 5px',
  zIndex: 10,
  '@container': {
    '(max-width: 420px)': {
      right: '12px',
    },
  },
  '@media': {
    [TOUCH_FIRST_QUERY]: { selectors: { '&&': { display: 'none' } } },
  },
});

export const swipeReplyIcon = style({
  position: 'absolute',
  left: '16px',
  top: '50%',
  width: '32px',
  height: '32px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: '50%',
  backgroundColor: vars.color.bgTertiary,
  color: vars.color.textPrimary,
  opacity: 0,
  transform: 'translateY(-50%) scale(0.6)',
  pointerEvents: 'none',
});

export const msgActionBtn = style({
  width: '30px',
  height: '30px',
  borderRadius: vars.radius.sm,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
  border: 'none',
  color: vars.color.textMuted,
  fontSize: chatSize(0.83),
  ':hover': { backgroundColor: vars.color.bgHover, color: vars.color.textPrimary },
});

export const msgActionBtnPinned = style([
  msgActionBtn,
  {
    color: vars.color.accent,
    ':hover': { backgroundColor: vars.color.bgHover, color: vars.color.accent },
  },
]);

export const editContainer = style({
  borderRadius: '10px',
  border: `2px solid ${vars.color.accent}`,
  backgroundColor: vars.color.bgSecondary,
  padding: '8px',
  display: 'flex',
  flexDirection: 'column',
  gap: '6px',
  width: '100%',
  maxWidth: '90%',
  alignSelf: 'flex-start',
  position: 'relative',
});

// Slate rich editor inside the inline edit bubble
export const editRichEditor = style({
  width: '100%',
  minHeight: '50px',
  maxHeight: '200px',
  border: 'none',
  outline: 'none',
  backgroundColor: 'transparent',
  color: vars.color.textPrimary,
  fontFamily: 'inherit',
  fontSize: chatSize(0.95),
  lineHeight: '1.375',
  padding: '4px 0',
  overflowY: 'auto',
  wordBreak: 'break-word',
});

globalStyle(`${editRichEditor} p`, { margin: 0 });
globalStyle(`${editRichEditor} p + p`, { marginTop: '2px' });
globalStyle(`${editRichEditor} blockquote`, {
  margin: '2px 0',
  paddingLeft: '10px',
  borderLeft: `3px solid ${vars.color.accent}`,
  color: vars.color.textMuted,
});
globalStyle(`${editRichEditor} pre`, {
  margin: '2px 0',
  padding: '4px 8px',
  backgroundColor: vars.color.bgTertiary,
  borderRadius: '4px',
  fontFamily: 'monospace',
  fontSize: '0.9em',
  overflowX: 'auto',
});
globalStyle(`${editRichEditor} code`, {
  backgroundColor: vars.color.bgTertiary,
  borderRadius: '3px',
  padding: '1px 4px',
  fontFamily: 'monospace',
  fontSize: '0.9em',
});
globalStyle(`${editRichEditor} a`, {
  color: vars.color.link,
  textDecoration: 'underline',
  cursor: 'pointer',
});
globalStyle(`${editRichEditor} [data-slate-placeholder]`, {
  color: vars.color.textMuted,
  pointerEvents: 'none',
  userSelect: 'none',
});
globalStyle(`${editRichEditor} .mention-pill`, {
  display: 'inline-block',
  backgroundColor: `color-mix(in srgb, ${vars.color.accent} 15%, transparent)`,
  color: vars.color.accent,
  borderRadius: '4px',
  padding: '0 4px',
  fontSize: '0.9em',
  fontWeight: 600,
  userSelect: 'none',
  cursor: 'default',
});

export const editActions = style({
  display: 'flex',
  justifyContent: 'flex-end',
  gap: '6px',
  alignItems: 'center',
});

export const editBtn = style({
  padding: '4px 12px',
  borderRadius: vars.radius.sm,
  fontSize: chatSize(0.82),
  border: 'none',
  cursor: 'pointer',
  fontFamily: 'inherit',
  fontWeight: 600,
  transition: `background-color ${fast}`,
});

export const editBtnSave = style([
  editBtn,
  {
    backgroundColor: vars.color.accent,
    color: '#fff',
    ':hover': { backgroundColor: vars.color.accentHover },
    ':disabled': { opacity: 0.5, cursor: 'default' },
  },
]);

export const editBtnCancel = style([
  editBtn,
  {
    backgroundColor: vars.color.bgTertiary,
    color: vars.color.textPrimary,
    ':hover': { backgroundColor: vars.color.bgHover },
  },
]);

export const unreadDivider = style({
  display: 'grid',
  gridTemplateColumns: '1fr auto 1fr',
  alignItems: 'center',
  gap: '8px',
  padding: '6px 16px',
});

export const unreadDividerLines = style({
  flex: 1,
  height: '1px',
  backgroundColor: vars.color.accent,
});

export const unreadDividerLabel = style({
  textAlign: 'center',
  fontSize: chatSize(0.75),
  color: vars.color.accent,
  fontWeight: 700,
  whiteSpace: 'nowrap',
  userSelect: 'none',
  letterSpacing: '0.03em',
  textTransform: 'uppercase',
});

export const unreadDividerRight = style({
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
});

export const unreadDividerDismiss = style({
  flexShrink: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '16px',
  height: '16px',
  borderRadius: '50%',
  border: 'none',
  backgroundColor: vars.color.accent,
  color: '#fff',
  cursor: 'pointer',
  padding: 0,
  opacity: 0.8,
  ':hover': { opacity: 1 },
});

const fadeIn = keyframes({
  from: { opacity: 0, transform: 'translateY(6px)' },
  to: { opacity: 1, transform: 'translateY(0)' },
});

export const scrollToBottomAnchor = style({
  position: 'relative',
  height: 0,
  flexShrink: 0,
});

export const scrollToBottomBtn = style({
  position: 'absolute',
  bottom: '12px',
  right: '20px',
  width: '36px',
  height: '36px',
  borderRadius: '50%',
  backgroundColor: vars.color.accent,
  color: '#fff',
  border: 'none',
  cursor: 'pointer',
  fontSize: chatSize(0.9),
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 10,
  animationName: fadeIn,
  animationDuration: '120ms',
  animationTimingFunction: 'ease-out',
  ':hover': { backgroundColor: vars.color.accentHover },
});

export const tombstoneBanner = style({
  display: 'flex',
  alignItems: 'center',
  gap: '12px',
  padding: '12px 16px',
  backgroundColor: vars.color.bgTertiary,
  borderBottom: `1px solid ${vars.color.border}`,
  fontSize: chatSize(0.9),
  color: vars.color.textPrimary,
  flexShrink: 0,
});

export const tombstoneBannerText = style({
  flex: 1,
});

export const tombstoneBannerBtn = style({
  padding: '6px 14px',
  borderRadius: vars.radius.sm,
  border: 'none',
  backgroundColor: vars.color.accent,
  color: '#fff',
  fontSize: chatSize(0.85),
  fontWeight: 600,
  cursor: 'pointer',
  fontFamily: 'inherit',
  whiteSpace: 'nowrap',
  flexShrink: 0,
  ':hover': {
    backgroundColor: vars.color.accentHover,
  },
});

export const searchBanner = style({
  padding: '4px 16px',
  fontSize: chatSize(0.8),
  backgroundColor: vars.color.bgAccentGlow1,
  color: vars.color.accent,
  borderBottom: `1px solid ${vars.color.border}`,
  flexShrink: 0,
});

export const searchMatchActive = style({
  outline: `2px solid ${vars.color.accent}`,
  outlineOffset: '-2px',
  borderRadius: '4px',
});

const jumpFlashKeyframes = keyframes({
  '0%': { backgroundColor: vars.color.bgActive },
  '100%': { backgroundColor: 'transparent' },
});

export const msgJumpFlash = style({
  selectors: {
    [`&[data-flashing='true']::before`]: {
      content: '""',
      position: 'absolute',
      inset: 0,
      borderRadius: '12px',
      pointerEvents: 'none',
      zIndex: 0,
      animationName: jumpFlashKeyframes,
      animationDuration: '1.5s',
      animationTimingFunction: 'ease-out',
      animationFillMode: 'forwards',
    },
  },
});

export const msgLive = style({
  animationName: fadeInUp,
  animationDuration: '120ms',
  animationTimingFunction: 'ease-out',
  selectors: {
    'html[data-no-send-anim] &': { animation: 'none' },
  },
});

export const systemMsgRow = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '6px',
  padding: '4px 16px',
  color: vars.color.textMuted,
  fontSize: chatSize(0.82),
  fontStyle: 'italic',
  userSelect: 'none',
});

export const systemMsgText = style({
  textAlign: 'center',
});

export const systemMsgInlineName = style({
  display: 'inline-flex',
  alignItems: 'center',
  gap: '4px',
  marginLeft: '4px',
  verticalAlign: 'middle',
});

export const systemMsgName = style({
  font: 'inherit',
  color: 'inherit',
  background: 'none',
  border: 'none',
  padding: 0,
  margin: 0,
  cursor: 'pointer',
  selectors: {
    '&:hover': {
      textDecoration: 'underline',
    },
    '&:focus-visible': {
      outline: `2px solid ${vars.color.accent}`,
      outlineOffset: '2px',
      borderRadius: '2px',
    },
  },
});

export const callPill = style({
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  width: 'fit-content',
  maxWidth: '92%',
  margin: '8px auto',
  padding: '5px 12px 5px 8px',
  borderRadius: vars.radius.lg,
  backgroundColor: vars.color.bgPrimary,
  border: `1px solid ${vars.color.border}`,
  color: vars.color.textSecondary,
  userSelect: 'none',
});

export const callPillOngoing = style({
  borderColor: vars.color.success,
});

export const callPillEnded = style({
  opacity: 0.8,
});

export const callPillMissed = style({});

export const callPillIcon = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '22px',
  height: '22px',
  borderRadius: '50%',
  flexShrink: 0,
  backgroundColor: vars.color.bgTertiary,
  color: vars.color.textMuted,
  selectors: {
    [`${callPillOngoing} &`]: {
      color: vars.color.success,
    },
    [`${callPillMissed} &`]: {
      color: vars.color.error,
    },
  },
});

export const callPillLabel = style({
  fontSize: chatSize(0.82),
  whiteSpace: 'nowrap',
});

export const callAvatarStack = style({
  display: 'flex',
  alignItems: 'center',
  flexShrink: 0,
});

export const callPillDuration = style({
  fontSize: chatSize(0.74),
  color: vars.color.textMuted,
  fontVariantNumeric: 'tabular-nums',
  whiteSpace: 'nowrap',
  flexShrink: 0,
});

export const callPillJoin = style({
  padding: '2px 10px',
  borderRadius: vars.radius.sm,
  border: 'none',
  backgroundColor: vars.color.success,
  color: '#fff',
  fontSize: chatSize(0.74),
  fontWeight: 600,
  cursor: 'pointer',
  fontFamily: 'inherit',
  whiteSpace: 'nowrap',
  flexShrink: 0,
  ':hover': {
    filter: 'brightness(1.1)',
  },
});

export const searchEmpty = style({
  padding: '32px 16px',
  textAlign: 'center',
  color: vars.color.textMuted,
  fontSize: chatSize(0.9),
});

globalStyle('blockquote', {
  borderLeft: `2px solid ${vars.color.accent}`,
  paddingLeft: '12px',
  margin: '8px 0',
  color: vars.color.textMuted,
});

globalStyle('code', {
  backgroundColor: vars.color.bgTertiary,
  borderRadius: '4px',
  padding: '1px 5px',
  fontSize: '0.88em',
  fontFamily: "'SF Mono', 'Fira Code', 'JetBrains Mono', monospace",
});

globalStyle('pre', {
  backgroundColor: vars.color.bgTertiary,
  borderRadius: '6px',
  padding: '12px',
  margin: '8px 0',
  overflowX: 'auto',
  position: 'relative',
});

globalStyle('pre code', {
  backgroundColor: 'transparent',
  borderRadius: 0,
  padding: 0,
  fontSize: '0.85em',
});

export const richHtmlSegment = style({
  display: 'contents',
});

export const codeBlock = style({
  margin: '8px 0',
  borderRadius: '6px',
  overflow: 'hidden',
});

globalStyle(`${codeBlock} pre`, {
  margin: 0,
  borderRadius: 0,
});

export const codeBlockHeader = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '8px',
  padding: '4px 12px',
  backgroundColor: vars.color.bgTertiary,
  borderBottom: `1px solid ${vars.color.border}`,
});

export const codeBlockLabel = style({
  fontSize: chatSize(0.72),
  fontWeight: 600,
  color: vars.color.textMuted,
  textTransform: 'lowercase',
  fontFamily: "'SF Mono', 'Fira Code', 'JetBrains Mono', monospace",
});

export const codeCopyBtn = style({
  flexShrink: 0,
});

globalStyle('.mention-pill', {
  display: 'inline',
  backgroundColor: `rgba(${vars.color.accentRgb}, 0.18)`,
  color: vars.color.accent,
  borderRadius: '4px',
  padding: '0 4px',
  fontSize: '0.92em',
  fontWeight: 600,
  whiteSpace: 'nowrap',
  cursor: 'pointer',
  userSelect: 'text',
});

globalStyle('.mention-pill:focus-visible', {
  outline: `2px solid ${vars.color.accent}`,
  outlineOffset: '1px',
});

globalStyle('a.mention-pill.room-pill', {
  color: vars.color.accent,
  textDecoration: 'none',
});

globalStyle('a.mention-pill.room-pill:hover', {
  textDecoration: 'underline',
});

globalStyle('.mention-pill-self', {
  backgroundColor: `color-mix(in srgb, ${vars.color.mention} 18%, transparent)`,
  color: vars.color.mention,
});

globalStyle('.room-mention', {
  backgroundColor: `color-mix(in srgb, ${vars.color.mention} 16%, transparent)`,
  color: vars.color.mention,
  borderRadius: '3px',
  padding: '0 2px',
  fontWeight: 600,
  whiteSpace: 'nowrap',
});

globalStyle('.mention-pill.room-mention-pill', {
  backgroundColor: `color-mix(in srgb, ${vars.color.mention} 22%, transparent)`,
  color: vars.color.mention,
});

const bubbleClasses = [
  msgContentClassic,
  msgContentClassicOwn,
  msgContentClassicGrouped,
  msgContentClassicGroupedOwn,
];
const bubbleSelector = (descendant: string) =>
  bubbleClasses.map((c) => `${c} ${descendant}`).join(', ');

// Classic bubbles: other users' pills take the bubble's text colour so they read on any bubble;
// self and room mentions keep the mention colour from the rules above
globalStyle(bubbleSelector('.mention-pill:not(.mention-pill-self):not(.room-mention-pill)'), {
  color: 'inherit',
  backgroundColor: 'color-mix(in srgb, currentColor 14%, transparent)',
});

// Spoiler / content warning - blurred until clicked
globalStyle('[data-mx-spoiler]', {
  filter: 'blur(5px)',
  cursor: 'pointer',
  userSelect: 'none',
  borderRadius: vars.radius.sm,
  transition: 'filter 0.2s ease',
});

globalStyle('[data-mx-spoiler-revealed="true"]', {
  filter: 'none',
  cursor: 'default',
  userSelect: 'auto',
});

// Spoiler reason label - displayed above the blurred content
globalStyle('.spoiler-reason', {
  display: 'block',
  fontSize: chatSize(0.72),
  color: vars.color.textMuted,
  marginBottom: '2px',
});

// Prettified link
globalStyle('a.prettified-link', {
  display: 'inline-grid',
  gridTemplateColumns: 'minmax(0, auto)',
  position: 'relative',
  backgroundColor: `color-mix(in srgb, ${vars.color.link} 12%, transparent)`,
  color: vars.color.link,
  borderRadius: '4px',
  padding: '0 6px',
  fontSize: '0.85em',
  fontWeight: 500,
  textDecoration: 'none',
  lineHeight: '1.6',
  maxWidth: '100%',
  transition: `background-color ${fast}, color ${fast}, text-decoration ${fast}`,
});

globalStyle('a.prettified-link .pretty-text', {
  gridArea: '1 / 1',
  whiteSpace: 'nowrap',
});

globalStyle('a.prettified-link .full-text', {
  gridArea: '1 / 1',
  display: 'none',
});

globalStyle('a.prettified-link:hover', {
  backgroundColor: 'transparent',
  color: vars.color.link,
  textDecoration: 'underline',
});

globalStyle('a.prettified-link:hover .pretty-text', {
  display: 'none',
});

globalStyle('a.prettified-link:hover .full-text', {
  display: 'block',
  whiteSpace: 'normal',
  wordBreak: 'break-all',
  textDecoration: 'underline',
});

globalStyle(bubbleSelector('a'), {
  color: vars.color.textPrimary,
  textDecoration: 'underline',
});
globalStyle(bubbleSelector('a.prettified-link'), {
  border: `1px solid rgba(${vars.color.accentRgb}, 0.25)`,
  color: vars.color.textPrimary,
  textDecoration: 'none',
});
globalStyle(bubbleSelector('a.prettified-link:hover'), {
  backgroundColor: 'transparent',
  color: vars.color.textPrimary,
  textDecoration: 'underline',
});

export const readReceiptRow = style({
  display: 'flex',
  alignItems: 'center',
  alignSelf: 'flex-end',
  flexShrink: 0,
  width: '52px',
  minHeight: '16px',
  '@media': {
    // On a phone the fixed column would squeeze every message; it only takes room when needed.
    '(max-width: 768px)': { width: 'auto', minHeight: 0 },
  },
  selectors: {
    '&:empty': { display: 'none' },
  },
});

export const readReceiptRowSpaced = style({
  marginTop: 0,
  paddingTop: '2px',
});

export const threadBadge = style({
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
  alignSelf: 'flex-start',
  maxWidth: '100%',
  minWidth: 0,
  marginTop: '4px',
  padding: '3px 10px 3px 7px',
  border: `1px solid ${vars.color.border}`,
  borderRadius: vars.radius.lg,
  background: vars.color.bgSecondary,
  color: vars.color.textSecondary,
  fontSize: chatSize(0.8125),
  fontFamily: 'inherit',
  lineHeight: 1.35,
  textAlign: 'left',
  cursor: 'pointer',
  transition: `background-color ${fast}`,
  ':hover': { backgroundColor: vars.color.bgTertiary },
});

export const threadBadgeIconWrap = style({
  position: 'relative',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
});

export const threadBadgeDot = style({
  position: 'absolute',
  right: '-2px',
  bottom: '-2px',
  width: '8px',
  height: '8px',
  borderRadius: '50%',
  backgroundColor: vars.color.accent,
  boxShadow: `0 0 0 2px ${vars.color.bgSecondary}`,
});

export const threadBadgeCount = style({
  flexShrink: 0,
  fontWeight: 600,
  color: vars.color.textPrimary,
  fontVariantNumeric: 'tabular-nums',
});

export const threadBadgeName = style({
  display: 'flex',
  flexShrink: 0,
  fontWeight: 600,
  color: vars.color.textPrimary,
});

export const threadBadgeNameText = style({
  maxWidth: '10ch',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});

export const threadBadgeBody = style({
  flex: '1 1 auto',
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  color: vars.color.textPrimary,
});

export const readReceiptAvatar = style({
  width: '16px',
  height: '16px',
  borderRadius: '50%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: chatSize(0.55),
  fontWeight: 700,
  color: '#fff',
  flexShrink: 0,
  overflow: 'hidden',
  userSelect: 'none',
  border: `1px solid ${vars.color.bgPrimary}`,
  marginLeft: '-6px',
  ':first-child': { marginLeft: 0 },
  cursor: 'default',
});

export const readReceiptAvatarImg = style({
  width: '100%',
  height: '100%',
  objectFit: 'cover',
  borderRadius: 'inherit',
});

export const readReceiptAvatarMark = style({
  width: '58%',
  height: '58%',
  display: 'block',
  color: '#fff',
});

export const readReceiptOverflow = style({
  fontSize: chatSize(0.6),
  color: vars.color.textMuted,
  marginLeft: '3px',
  marginRight: '2px',
  whiteSpace: 'nowrap',
  userSelect: 'none',
});

export const readReceiptAvatarBtn = style({
  padding: 0,
  border: 'none',
  background: 'none',
  color: 'inherit',
  font: 'inherit',
  cursor: 'pointer',
});

export const readReceiptOverflowBtn = style({
  fontSize: chatSize(0.6),
  color: vars.color.textMuted,
  marginLeft: '3px',
  marginRight: '2px',
  whiteSpace: 'nowrap',
  userSelect: 'none',
  padding: 0,
  border: 'none',
  background: 'none',
  cursor: 'pointer',
  fontFamily: 'inherit',
  transition: `color ${fast}`,
  ':hover': { color: vars.color.textPrimary },
});

export const receiptPopoverTitle = style({
  fontSize: chatSize(0.72),
  fontWeight: 600,
  color: vars.color.textMuted,
  letterSpacing: '0.04em',
  padding: '2px 8px',
});

export const receiptPopoverItem = style({
  listStyle: 'none',
  margin: 0,
  padding: 0,
});

export const receiptPopoverRow = style({
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  width: '100%',
  padding: '5px 8px',
  border: 'none',
  background: 'none',
  borderRadius: vars.radius.sm,
  cursor: 'pointer',
  color: vars.color.textPrimary,
  fontFamily: 'inherit',
  textAlign: 'left',
  transition: `background-color ${fast}`,
  ':hover': { backgroundColor: vars.color.bgHover },
});

export const receiptPopoverMeta = style({
  display: 'flex',
  flexDirection: 'column',
  minWidth: 0,
  flex: 1,
});

export const receiptPopoverUserName = style({
  fontSize: chatSize(0.85),
  fontWeight: 500,
  color: vars.color.textPrimary,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});

export const receiptPopoverTime = style({
  fontSize: chatSize(0.72),
  color: vars.color.textMuted,
});

export const msgSending = style({
  opacity: 0.6,
});

export const msgFailed = style({
  opacity: 0.6,
});

export const sendFailedRow = style({
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
  flexBasis: '100%',
  marginTop: '6px',
  paddingTop: '6px',
  borderTop: `1px solid ${vars.color.error}33`,
  opacity: 1,
  fontSize: chatSize(0.78),
  flexWrap: 'wrap',
});

export const sendFailedIcon = style({
  color: vars.color.error,
  flexShrink: 0,
});

export const sendFailedText = style({
  color: vars.color.error,
  fontSize: chatSize(0.78),
  fontWeight: 500,
});

const failedPill = style({
  fontSize: chatSize(0.72),
  padding: '2px 8px',
  borderRadius: '10px',
  border: `1px solid ${vars.color.border}`,
  cursor: 'pointer',
  fontFamily: 'inherit',
  fontWeight: 600,
  lineHeight: 1.4,
  background: 'none',
  transition: `border-color ${fast}, background-color ${fast}`,
});

export const sendRetryBtn = style([
  failedPill,
  {
    color: vars.color.accent,
    borderColor: vars.color.accent,
    ':hover': { backgroundColor: vars.color.bgActive, borderColor: vars.color.accentHover },
  },
]);

export const sendDiscardBtn = style([
  failedPill,
  {
    color: vars.color.textMuted,
    ':hover': { backgroundColor: vars.color.bgHover, color: vars.color.textPrimary },
  },
]);

export const chatDropZone = style({
  position: 'absolute',
  inset: 0,
  backgroundColor: 'rgba(88,101,242,0.12)',
  border: `2px dashed ${vars.color.accent}`,
  borderRadius: '12px',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '12px',
  color: vars.color.accent,
  fontSize: chatSize(1.2),
  fontWeight: 600,
  zIndex: 200,
  pointerEvents: 'none',
  backdropFilter: 'blur(3px)',
});

// Compact layout (Discord-style), toggled via the root attribute: no avatars, the time sits in a
// right-aligned gutter on the left, and the sender name and message text flow inline after it.
// Spacing follows the message spacing setting like the other layouts, just from a tighter base.
globalStyle(`:root[data-compact-layout] ${msgRow}`, {
  paddingTop: chatSpace(2),
  paddingBottom: chatSpace(0.5),
});
globalStyle(`:root[data-compact-layout] ${msgRowGrouped}`, {
  paddingTop: chatSpace(0.5),
  paddingBottom: chatSpace(0.5),
});
globalStyle(`:root[data-compact-layout] ${msgAvatarCol}`, { display: 'none' });
globalStyle(`:root[data-compact-layout] ${msgHoverRegion}`, { gap: '0' });
globalStyle(`:root[data-compact-layout] ${msgBody}`, {
  display: 'flex',
  flexDirection: 'row',
  flexWrap: 'wrap',
  alignItems: 'baseline',
  position: 'relative',
  paddingLeft: '76px',
  paddingRight: '8px',
});
// Everything except the name and the text (replies, reactions, threads, ...) takes its own line.
globalStyle(`:root[data-compact-layout] ${msgBody} > *`, { flex: '0 0 100%' });
globalStyle(`:root[data-compact-layout] ${msgBody} > ${msgMeta}`, { flex: '0 0 auto' });
globalStyle(`:root[data-compact-layout] ${msgBody} > ${msgContent}`, {
  flex: '1 1 0',
  minWidth: 0,
  display: 'block',
});
globalStyle(`:root[data-compact-layout] ${msgMeta}`, {
  display: 'block',
  marginBottom: '0',
  marginRight: '6px',
});
globalStyle(`:root[data-compact-layout] ${msgTime}`, {
  position: 'absolute',
  left: 0,
  top: 0,
  width: '64px',
  textAlign: 'right',
  opacity: 1,
  fontSize: fontSize.rem68,
  lineHeight: 'calc(0.95rem * 1.375)',
});
globalStyle(`:root[data-compact-layout] ${msgSender}`, { fontSize: fontSize.rem95 });
globalStyle(`:root[data-compact-layout] ${msgContent}`, { lineHeight: '1.375' });
// The edit box takes its own full-width line under the name instead of squeezing in beside it.
globalStyle(`:root[data-compact-layout] ${editContainer}`, { maxWidth: '100%', marginTop: '4px' });
// Media and other block content goes on the line below the author, aligned with the name.
globalStyle(
  `:root[data-compact-layout] ${msgBody} > ${msgContent}:has(${mediaBox}, ${stickerBox}, ${mediaWrap}, ${mediaError}, ${gallery}, ${fileCard}, ${locationMsg}, pre, blockquote, table, ul, ol, video, audio)`,
  { flex: '0 0 100%' }
);
// Emoji-only messages keep the normal text size.
globalStyle(`:root[data-compact-layout] ${emojiOnly}`, {
  fontSize: 'inherit',
  lineHeight: 'inherit',
});

// Bubble layout (root attribute): your messages sit on the right without avatar or name, the time
// is always visible, and receipts / the Sent marker sit under the bubble.
globalStyle(`:root[data-bubble-layout] ${msgRowOwn} ${msgAvatarCol}`, { display: 'none' });
globalStyle(`:root[data-bubble-layout] ${msgSender}`, { fontSize: fontSize.rem80 });
globalStyle(`:root[data-bubble-layout] ${msgTime}`, { fontSize: fontSize.rem66, opacity: 1 });
globalStyle(`:root[data-bubble-layout] ${msgAvatarCol}`, { width: '24px' });
globalStyle(`:root[data-bubble-layout] ${msgRowOwn} ${msgMeta}`, { justifyContent: 'flex-end' });
globalStyle(`:root[data-bubble-layout] ${msgRowOwn} ${msgBody}`, {
  alignItems: 'flex-end',
  paddingRight: '16px',
});
globalStyle(
  `:root[data-bubble-layout] ${msgContentClassicOwn} a, :root[data-bubble-layout] ${msgContentClassicGroupedOwn} a`,
  {
    color: 'inherit',
    textDecoration: 'underline',
  }
);
globalStyle(`:root[data-bubble-layout] ${msgBody}`, { gap: '2px' });

export const bubbleStatusRow = style({
  display: 'flex',
  alignItems: 'center',
  alignSelf: 'flex-start',
  gap: '4px',
  marginTop: '2px',
  padding: '0 6px',
  fontSize: fontSize.rem66,
  color: vars.color.textMuted,
});
export const bubbleStatusRowOwn = style({ alignSelf: 'flex-end' });
globalStyle(`:root[data-bubble-layout] ${bubbleStatusRow} ${readReceiptRow}`, {
  width: 'auto',
  minHeight: 0,
});

export const bubbleGroupedTime = style({
  display: 'block',
  alignSelf: 'flex-end',
  textAlign: 'right',
  fontSize: fontSize.rem66,
  opacity: 0.65,
  marginTop: 2,
});

// Your own replies sit on the right, so their quote hugs the right edge with the accent bar on its
// right side instead of floating at the far left of the row.
globalStyle(`:root[data-bubble-layout] ${msgRowOwn} ${replyQuote}`, {
  width: 'auto',
  maxWidth: 'min(78%, 620px)',
  alignSelf: 'flex-end',
  textAlign: 'right',
  borderLeft: 'none',
  borderRight: `3px solid ${vars.color.accent}`,
  paddingLeft: 0,
  paddingRight: '8px',
});

// Bubbles with media get more room (the bubble grows toward the middle of the screen) and the media
// is capped to the bubble's inner width so it never pokes out of the rounded edge.
globalStyle(
  bubbleClasses
    .map(
      (c) =>
        `:root[data-bubble-layout] ${c}:has(${mediaBox}, ${stickerBox}, ${mediaWrap}, ${gallery})`
    )
    .join(', '),
  { maxWidth: 'min(90%, 620px)' }
);
globalStyle(
  bubbleClasses
    .flatMap((c) => [
      `:root[data-bubble-layout] ${c} ${mediaBox}`,
      `:root[data-bubble-layout] ${c} ${mediaWrap}`,
      `:root[data-bubble-layout] ${c} ${gallery}`,
    ])
    .join(', '),
  { maxWidth: '100%' }
);
// Media boxes carry a fixed pixel size inline; when the bubble is narrower the box shrinks and its
// height follows the aspect ratio rather than being squashed.
globalStyle(bubbleClasses.map((c) => `:root[data-bubble-layout] ${c} ${mediaBox}`).join(', '), {
  height: 'auto !important',
});
