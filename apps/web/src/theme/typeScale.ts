// The six steps of the type scale (12, 14, 16, 20, 24, 32 at the default 16px root). Sizes are in
// rem so the app's zoom setting (html font-size) still scales every piece of text.
//
// The old names below are aliases that now point at the merged steps, so call sites that still use
// them keep working. New and edited code should use xs…xxl; the aliases can be renamed in a later
// pass without changing any size.

const steps = {
  /** 12px: badges, metadata, timestamps */
  xs: '0.75rem',
  /** 14px: secondary text, labels, rows */
  sm: '0.875rem',
  /** 16px: body and default UI text */
  md: '1rem',
  /** 20px: section and dialog titles */
  lg: '1.25rem',
  /** 24px: page titles */
  xl: '1.5rem',
  /** 32px: display headings */
  xxl: '2rem',
} as const;

export const fontSize = {
  ...steps,

  // Aliases kept for existing call sites (see the note above).
  px12: steps.xs,
  px13: steps.sm,
  px14: steps.sm,
  px16: steps.md,
  em85: steps.sm,
  em90: steps.sm,
  rem66: steps.xs,
  rem68: steps.xs,
  rem70: steps.xs,
  rem72: steps.xs,
  rem74: steps.xs,
  rem75: steps.xs,
  rem76: steps.xs,
  rem78: steps.xs,
  rem80: steps.xs,
  rem82: steps.sm,
  rem83: steps.sm,
  rem84: steps.sm,
  rem85: steps.sm,
  rem88: steps.sm,
  rem90: steps.sm,
  rem92: steps.sm,
  rem95: steps.md,
  rem100: steps.md,
  rem105: steps.md,
  rem110: steps.md,
  rem120: steps.lg,
  rem130: steps.lg,
  rem140: steps.xl,
  rem150: steps.xl,
  rem160: steps.xl,
  rem200: steps.xxl,
} as const;

/** The line height each step of the scale is meant to be read at (unitless, so it follows the size). */
export const lineHeight = {
  xs: 1.33,
  sm: 1.43,
  md: 1.5,
  lg: 1.4,
  xl: 1.33,
  xxl: 1.25,
} as const;

export type FontSizeStep = keyof typeof steps;
