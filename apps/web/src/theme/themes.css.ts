import { style } from '@vanilla-extract/css';
import { defaultThemeId, themeColors, themes } from '@wizardchat/design-tokens';
import { logoVars, themeVars } from './themeTokens';

const themeClass = (id: (typeof themes)[number]['id']) =>
  style({ selectors: { 'html&': { vars: themeVars(themeColors[id].color) } } });

/** Class that applies each built-in theme, by name */
export const THEMES: Record<string, string> = Object.fromEntries(
  themes.map((theme) => [theme.name, themeClass(theme.id)])
);

export const DEFAULT_THEME = themes.find((theme) => theme.id === defaultThemeId)?.name ?? 'Carbon';

/** The app icon in its default colours, whatever the theme */
export const baseLogoClass = style({
  selectors: {
    'html&': { vars: logoVars(themeColors[defaultThemeId].color.logo) },
  },
});
