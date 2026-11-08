import { vars as tokens } from '@wizardchat/design-tokens';

/**
 * The WizardChat style contract, backed by the shared design tokens (CSS variables set per
 * theme in themes.css.ts).
 */
export const vars = {
  color: {
    bgPrimary: tokens.color.bg.app,
    bgSecondary: tokens.color.bg.surface,
    bgTertiary: tokens.color.bg.raised,
    bgInput: tokens.color.bg.input,
    bgHover: tokens.color.bg.hover,
    bgActive: tokens.color.bg.active,
    accent: tokens.color.accent.default,
    accentRgb: 'var(--wz-accent-rgb)',
    accentHover: tokens.color.accent.hover,
    link: tokens.color.text.link,
    onAccent: tokens.color.text.onAccent,
    textPrimary: tokens.color.text.primary,
    textMuted: tokens.color.text.muted,
    textSecondary: tokens.color.text.disabled,
    border: tokens.color.border.default,
    msgMineBg: tokens.color.message.mine,
    msgOtherBg: tokens.color.message.other,
    mention: tokens.color.status.mention,
    error: tokens.color.status.error,
    danger: tokens.color.status.danger,
    success: tokens.color.status.success,
    warning: tokens.color.status.warning,
    bgAccentGlow1: tokens.color.accent.glow1,
    bgAccentGlow2: tokens.color.accent.glow2,
  },
  shadow: {
    sheet: '0 -8px 32px rgba(0,0,0,0.45)',
    popup: '0 8px 32px rgba(0,0,0,0.45)',
    popover: '0 8px 28px rgba(0,0,0,0.35)',
    menu: '0 8px 24px rgba(0,0,0,0.4)',
    lift: '0 6px 20px rgba(0, 0, 0, 0.12)',
  },
  scrim: {
    soft: 'rgba(0, 0, 0, 0.3)',
    base: 'rgba(0, 0, 0, 0.5)',
    modal: 'rgba(0, 0, 0, 0.6)',
    deep: 'rgba(0, 0, 0, 0.65)',
    media: 'rgba(0, 0, 0, 0.85)',
  },
  username: {
    c1: tokens.color.username.c1,
    c2: tokens.color.username.c2,
    c3: tokens.color.username.c3,
    c4: tokens.color.username.c4,
    c5: tokens.color.username.c5,
    c6: tokens.color.username.c6,
    c7: tokens.color.username.c7,
    c8: tokens.color.username.c8,
  },
  logo: {
    p0: tokens.color.logo.p0,
    p1: tokens.color.logo.p1,
    p2: tokens.color.logo.p2,
    p3: tokens.color.logo.p3,
    p4: tokens.color.logo.p4,
    p5: tokens.color.logo.p5,
    hover: tokens.color.logo.hover,
    hoverGlow: tokens.color.logo.hoverGlow,
  },
  radius: {
    sm: tokens.radius.sm,
    md: tokens.radius.md,
    lg: tokens.radius.xl,
    pill: tokens.radius.pill,
  },
  font: {
    // The emoji style puts its font before the UI font (so a whole emoji sequence is shaped by one
    // font) and a safety net after it, through these two properties (see util/emojiStyle.ts).
    body: `var(--mudrix-emoji-font-first, "Mudrix Native"), ${tokens.font.family.body}, var(--mudrix-emoji-font-last, "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji")`,
  },
} as const;
