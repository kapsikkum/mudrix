import { assignVars, createTheme, style } from '@vanilla-extract/css';
import { vars } from './vars.css';
import { BASE_LOGO, THEME_TOKENS } from './themeTokens';

export const defaultTheme = createTheme(vars, THEME_TOKENS.Carbon);

export const parrotTheme = createTheme(vars, THEME_TOKENS.Parrot);

export const hallowTheme = createTheme(vars, THEME_TOKENS.Hallow);

export const etherealTheme = createTheme(vars, THEME_TOKENS.Ethereal);

export const pewterTheme = createTheme(vars, THEME_TOKENS.Pewter);

export const umbraTheme = createTheme(vars, THEME_TOKENS.Umbra);

export const eclipseTheme = createTheme(vars, THEME_TOKENS.Eclipse);

export const garnetTheme = createTheme(vars, THEME_TOKENS.Garnet);

export const blossomTheme = createTheme(vars, THEME_TOKENS.Blossom);

export const baseLogoClass = style({ vars: assignVars(vars.logo, BASE_LOGO) });

export const THEMES: Record<string, string> = {
  Carbon: defaultTheme,
  Parrot: parrotTheme,
  Hallow: hallowTheme,
  Ethereal: etherealTheme,
  Pewter: pewterTheme,
  Umbra: umbraTheme,
  Eclipse: eclipseTheme,
  Garnet: garnetTheme,
  Blossom: blossomTheme,
};

export const DEFAULT_THEME = 'Carbon';
