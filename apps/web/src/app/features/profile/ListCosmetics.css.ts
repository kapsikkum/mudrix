import { style } from '@vanilla-extract/css';
import { zIndex } from '@/theme/zIndex';
import { vars } from '@/theme/vars.css';
import { fast } from '@/theme/animations.css';

/**
 * Nameplate behind a whole list row (Discord style): a palette wash with the artwork fading in
 * from the right. The row must be `position: relative; isolation: isolate`.
 */
export const listNameplate = style({
  position: 'absolute',
  inset: 0,
  zIndex: zIndex.behind,
  borderRadius: 'inherit',
  overflow: 'hidden',
  pointerEvents: 'none',
});

export const listNameplateImg = style({
  position: 'absolute',
  inset: 0,
  width: '100%',
  height: '100%',
  objectFit: 'cover',
  objectPosition: 'right center',
  maxWidth: 'none',
  userSelect: 'none',
});

/**
 * One horizontal scrim over the artwork: the surface colour at the left where the name and preview
 * sit, clear by the middle so the right half shows the art at full strength. A soft darkening under
 * it keeps any bright patch behind a long name from swallowing the text. The art keeps its opacity.
 */
export const listNameplateScrim = style({
  position: 'absolute',
  inset: 0,
  background: [
    // The surface: opaque under the avatar and a short name, gone by three-quarters of the card
    `linear-gradient(90deg, ${vars.color.bgPrimary} 0%, ${vars.color.bgPrimary} 40%, transparent 74%)`,
    // A quiet dim that carries the name's last characters without hiding the art on the right
    `linear-gradient(90deg, ${vars.scrim.soft} 0%, ${vars.scrim.soft} 66%, transparent 100%)`,
  ].join(', '),
});

/**
 * Hover and selection over a nameplate: the row's own background paints under the art, so this
 * translucent surface is the one that shows. Quiet, no outline.
 */
export const listNameplateWash = style({
  position: 'absolute',
  inset: 0,
  backgroundColor: 'transparent',
  transition: `background-color ${fast}`,
});

export const listDecorated = style({
  position: 'relative',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
});

/** Same 120% overlay as the profile card, centred over the avatar; never takes pointer events. */
export const listDecoration = style({
  position: 'absolute',
  top: '50%',
  left: '50%',
  transform: 'translate(-50%, -50%)',
  width: '120%',
  height: '120%',
  maxWidth: 'none',
  maxHeight: 'none',
  pointerEvents: 'none',
  userSelect: 'none',
  zIndex: zIndex.raised,
});
